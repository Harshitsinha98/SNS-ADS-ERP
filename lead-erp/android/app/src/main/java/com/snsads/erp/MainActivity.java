package com.codeskate.erp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codeskate.erp.calltracker.CallTrackerPlugin; // Import jasoos

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallTrackerPlugin.class); // Register jasoos
        super.onCreate(savedInstanceState);
    }
}