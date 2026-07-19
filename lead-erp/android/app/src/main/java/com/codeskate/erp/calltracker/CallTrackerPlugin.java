package com.codeskate.erp.calltracker;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.telephony.TelephonyManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Optional Android-only convenience tracker. The CRM's primary reliable flow
 * remains employee-initiated calls and post-call outcomes. This plugin only
 * emits a completed call once, while the app process is running and the user
 * has explicitly granted call-log permissions.
 */
@CapacitorPlugin(
    name = "CallTracker",
    permissions = {
        @Permission(
            strings = {Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG},
            alias = "calllog"
        )
    }
)
public class CallTrackerPlugin extends Plugin {
    private static final String PREFS = "codeskate_call_tracker";
    private static final String LAST_CALL_ID = "last_processed_call_id";
    private static final long CALL_LOG_WRITE_DELAY_MS = 2200L;
    private static final long CALL_LOG_SKEW_MS = 60000L;

    private BroadcastReceiver receiver;
    private boolean wasOffhook = false;
    private long offhookStartedAtMs = 0L;

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("calllog") != PermissionState.GRANTED) {
            requestPermissionForAlias("calllog", call, "permissionCallback");
            return;
        }
        registerReceiver();
        call.resolve();
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("calllog") == PermissionState.GRANTED) {
            registerReceiver();
            call.resolve();
        } else {
            call.reject("Permission denied — call tracking remains disabled.");
        }
    }

    private void registerReceiver() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
                if (state == null) return;
                if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
                    wasOffhook = true;
                    offhookStartedAtMs = System.currentTimeMillis();
                } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state) && wasOffhook) {
                    wasOffhook = false;
                    final long minimumDate = Math.max(0L, offhookStartedAtMs - CALL_LOG_SKEW_MS);
                    new Handler(Looper.getMainLooper()).postDelayed(
                        () -> emitLatestUnprocessedCall(minimumDate, null),
                        CALL_LOG_WRITE_DELAY_MS
                    );
                }
            }
        };
        IntentFilter filter = new IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void emitLatestUnprocessedCall(long minimumDate, PluginCall responseCall) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            if (responseCall != null) responseCall.reject("Call log permission is missing");
            return;
        }

        String[] projection = new String[]{
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE
        };
        String selection = minimumDate > 0 ? CallLog.Calls.DATE + " >= ?" : null;
        String[] selectionArgs = minimumDate > 0 ? new String[]{String.valueOf(minimumDate)} : null;
        Cursor cursor = getContext().getContentResolver().query(
            CallLog.Calls.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            CallLog.Calls.DATE + " DESC"
        );

        if (cursor == null) {
            if (responseCall != null) responseCall.resolve(new JSObject().put("found", false));
            return;
        }

        try {
            String lastId = preferences().getString(LAST_CALL_ID, null);
            while (cursor.moveToNext()) {
                String id = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls._ID));
                if (id != null && id.equals(lastId)) continue;
                int duration = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION));
                int type = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE));
                String number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                long date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE));

                // Missed/zero-duration calls are not automatic CRM activity.
                if (duration <= 0) {
                    preferences().edit().putString(LAST_CALL_ID, id).apply();
                    continue;
                }

                String typeValue = "other";
                if (type == CallLog.Calls.OUTGOING_TYPE) typeValue = "outgoing";
                else if (type == CallLog.Calls.INCOMING_TYPE) typeValue = "incoming";

                JSObject data = new JSObject();
                data.put("found", true);
                data.put("id", id);
                data.put("number", number);
                data.put("duration", duration);
                data.put("type", typeValue);
                data.put("date", date);

                // Do not advance the native cursor yet. JavaScript confirms
                // the ID only after its CRM write completes successfully.
                if (responseCall != null) responseCall.resolve(data);
                else notifyListeners("callEnded", data);
                return;
            }
            if (responseCall != null) responseCall.resolve(new JSObject().put("found", false));
        } finally {
            cursor.close();
        }
    }

    // Allows the app to check an unacknowledged completed call after resume.
    @PluginMethod
    public void getLastCall(PluginCall call) {
      emitLatestUnprocessedCall(0L, call);
    }

    // JavaScript calls this only after the CRM activity has been persisted.
    // Persisting the cursor here avoids losing an offline/failed call event.
    @PluginMethod
    public void markCallProcessed(PluginCall call) {
      String id = call.getString("id");
      if (id == null || id.isEmpty()) {
        call.reject("A call ID is required");
        return;
      }
      preferences().edit().putString(LAST_CALL_ID, id).apply();
      call.resolve();
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // Receiver was already unregistered by the Android lifecycle.
            }
            receiver = null;
        }
        wasOffhook = false;
        call.resolve();
    }
}
