package com.codeskate.erp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codeskate.erp.calltracker.CallTrackerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the optional Android call-tracker plugin before the bridge starts.
        registerPlugin(CallTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
