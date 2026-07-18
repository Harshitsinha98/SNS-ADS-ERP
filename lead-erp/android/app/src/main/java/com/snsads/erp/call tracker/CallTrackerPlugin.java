package com.codeskate.erp.calltracker;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CallLog;
import android.telephony.TelephonyManager;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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
    private BroadcastReceiver receiver = null;
    private boolean wasOffhook = false;

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
            call.reject("Permission denied — call tracking band rahega.");
        }
    }

    private void registerReceiver() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
                if (state == null) return;

                if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
                    wasOffhook = true;
                } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
                    if (wasOffhook) {
                        wasOffhook = false;
                        new Handler(Looper.getMainLooper()).postDelayed(() -> readLastCallLogEntry(), 1500);
                    }
                }
            }
        };
        getContext().registerReceiver(receiver, new IntentFilter("android.intent.action.PHONE_STATE"));
    }

    private void readLastCallLogEntry() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) return;

        Uri uri = CallLog.Calls.CONTENT_URI;
        String[] projection = new String[]{CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.TYPE};
        Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, CallLog.Calls.DATE + " DESC LIMIT 1");

        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    String number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                    int duration = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION));
                    int type = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE));

                    String typeStr = "other";
                    if (type == CallLog.Calls.OUTGOING_TYPE) typeStr = "outgoing";
                    else if (type == CallLog.Calls.INCOMING_TYPE) typeStr = "incoming";

                    JSObject data = new JSObject();
                    data.put("number", number);
                    data.put("duration", duration);
                    data.put("type", typeStr);

                    notifyListeners("callEnded", data);
                }
            } finally {
                cursor.close();
            }
        }
    }

    // =========================================================================
    // 🔥 NAYA INJECTED METHOD: App Resume hone par aakhiri call kheenchne ke liye
    // =========================================================================
    @PluginMethod
    public void getLastCall(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Permission missing");
            return;
        }

        Uri uri = CallLog.Calls.CONTENT_URI;
        String[] projection = new String[]{CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.TYPE};
        Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, CallLog.Calls.DATE + " DESC LIMIT 1");

        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    String number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                    int duration = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION));
                    int type = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE));

                    String typeStr = "other";
                    if (type == CallLog.Calls.OUTGOING_TYPE) typeStr = "outgoing";
                    else if (type == CallLog.Calls.INCOMING_TYPE) typeStr = "incoming";

                    JSObject data = new JSObject();
                    data.put("number", number);
                    data.put("duration", duration);
                    data.put("type", typeStr);

                    call.resolve(data);
                    return;
                }
            } finally {
                cursor.close();
            }
        }
        call.reject("No call log found");
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (receiver != null) {
            getContext().unregisterReceiver(receiver);
            receiver = null;
        }
        call.resolve();
    }
}