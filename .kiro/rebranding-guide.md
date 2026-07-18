# App Rebranding Guide & Google Play Permissions Documentation

**Status:** Completed
**Last Updated:** 2025-07-16
**New App Name:** CodeSkate
**New Package ID:** com.codeskate.erp

---

## Overview

This document provides:
1. **Rebranding checklist** for changing app name from "SNS ADS ERP" to **CodeSkate**
2. **Google Play permissions justification** for READ_CALL_LOG and READ_PHONE_STATE
3. **Permission declaration form guidance** for Play Console submission

---

## Part 1: Rebranding Checklist

### Files Requiring Changes

#### 1. Capacitor Configuration

**File:** `lead-erp/capacitor.config.json`

```json
// BEFORE
{
  "appId": "com.snsads.erp",
  "appName": "SNS ADS ERP",
  "webDir": "dist"
}

// AFTER
{
  "appId": "com.codeskate.erp",
  "appName": "CodeSkate",
  "webDir": "dist"
}
```

#### 2. Android Package Structure

**Files to update:**
- `android/app/build.gradle` — applicationId
- `android/app/src/main/AndroidManifest.xml` — package references
- `android/app/src/main/java/com/snsads/erp/` — rename directory
- `android/app/src/main/java/com/[newname]/erp/` — new path
- All Java files — update package declarations
- `android/app/src/main/res/values/strings.xml` — app_name

#### 3. HTML Title

**File:** `lead-erp/index.html`

```html
<!-- BEFORE -->
<title>SNS ADS ERP</title>

<!-- AFTER -->
<title>CodeSkate</title>
```

#### 4. Login Page

**File:** `lead-erp/src/pages/Login.jsx`

```jsx
// Line 48-49: Update branding
<span className="font-display font-semibold text-white text-lg tracking-tight">CodeSkate</span>
```

#### 5. Sidebar Component

**File:** `lead-erp/src/components/Sidebar.jsx`

```jsx
// Line 43: Update branding
<p className="font-display font-semibold text-white text-[15px] leading-tight">CodeSkate</p>
```

#### 6. Backend Health Check

**File:** `whatsapp-backend/server.js`

```javascript
// Line ~280: Update health check message
app.get("/", (req, res) => res.send("CodeSkate backend is running ✅"));
```

#### 7. Android Strings

**File:** `lead-erp/android/app/src/main/res/values/strings.xml`

```xml
<resources>
    <string name="app_name">CodeSkate</string>
    <string name="title_activity_main">CodeSkate</string>
    <string name="package_name">com.codeskate.erp</string>
</resources>
```

---

## Part 2: Google Play Permissions Justification

### Permissions Requested

| Permission | Purpose | Risk Level |
|------------|---------|------------|
| `READ_PHONE_STATE` | Detect call state (idle, offhook, ringing) | Restricted |
| `READ_CALL_LOG` | Read call details after completion | Restricted |

### Current Implementation

**File:** `android/app/src/main/java/com/snsads/erp/call tracker/CallTrackerPlugin.java`

**Functionality:**
1. Listens for phone state changes (via BroadcastReceiver)
2. Detects when a call ends (OFFHOOK → IDLE transition)
3. Reads the last call log entry after call completion
4. Extracts: phone number, call duration, call type (incoming/outgoing)
5. Notifies JavaScript layer with call details

**Use Case:** Lead management CRM for sales teams — automatically log call activity against customer leads.

---

## Part 3: Permissions Declaration Form Guidance

### Important: Current Policy Change

⚠️ **CRITICAL UPDATE (Effective January 27, 2027):**

Google Play will **NO LONGER PERMIT** account verification via phone call as a use case for READ_CALL_LOG permission. The policy states:

> "Our SMS and Call Log Permissions policy will no longer permit account verification via phone call as a use case for the READ_CALL_LOG permission."

### Permitted Use Cases (Current Policy)

Based on the official Google Play policy, the following use cases ARE permitted for READ_CALL_LOG:

| Use Case | Eligible Permissions | Your App Qualifies? |
|----------|---------------------|---------------------|
| **Default Phone handler** | READ_CALL_LOG, WRITE_CALL_LOG | ❌ No (not a dialer) |
| **Enterprise CRM** | READ_CALL_LOG*, PROCESS_OUTGOING_CALLS* | ✅ **YES** — Lead management CRM for businesses |
| **Caller ID / Spam detection** | READ_CALL_LOG | ❌ No |
| **Call-based authentication (banking)** | READ_CALL_LOG | ❌ No |
| **Backup and restore** | READ_CALL_LOG, WRITE_CALL_LOG | ❌ No |

**✅ YOUR APP QUALIFIES UNDER: Enterprise CRM (Customer Relationship Management)**

### Required Justification for Permission Declaration Form

When filling out the **Permissions Declaration Form** in Google Play Console, use the following justification:

---

### Declaration Form Response Template

**1. Which permission(s) does your app require?**
```
- READ_CALL_LOG
- READ_PHONE_STATE
```

**2. What is the core functionality of your app?**
```
[NEW NAME] is a Customer Relationship Management (CRM) application designed for 
sales teams and businesses to manage leads, track customer interactions, and 
automate sales workflows. The app serves as an enterprise CRM system that helps 
organizations track their sales pipeline, assign leads to team members, and 
log all customer communications in a centralized database.

Core features include:
- Lead management (create, assign, track status)
- WhatsApp integration for lead capture
- Call tracking and activity logging
- Team performance analytics
- Automated lead distribution (round-robin/workload balancing)
```

**3. How does your app use the requested permission(s)?**
```
READ_CALL_LOG and READ_PHONE_STATE are used specifically for:

1. CALL TRACKING FOR CRM RECORDS
   - When a sales team member makes or receives a call to/from a lead/customer,
     the app automatically logs the call details (phone number, duration, type)
   - This call record is associated with the corresponding lead in the CRM database
   - Sales managers can review call activity and measure team performance

2. AUTOMATIC ACTIVITY LOGGING
   - Call details are automatically captured without manual intervention
   - Reduces data entry burden on sales staff
   - Ensures accurate and complete customer interaction history

3. BUSINESS WORKFLOW AUTOMATION
   - Call duration is used to measure engagement and follow-up quality
   - Missed calls can trigger notifications for timely follow-up
   - Call frequency helps identify high-priority leads

IMPLEMENTATION DETAILS:
- Permission is only requested when user explicitly enables call tracking
- Call data is only read after call completion (not during active calls)
- Data is stored in the organization's secure Firestore database
- No data is sold or shared with third parties
- Users can disable call tracking at any time
```

**4. Is your app the default handler for SMS, Phone, or Assistant?**
```
No. The app is not a default dialer, SMS handler, or Assistant handler.
```

**5. Does your app qualify for an exception?**
```
Yes. The app qualifies under the "Enterprise archive, business & enterprise 
customer relationship management (CRM)" exception.

Justification:
- The app is designed for business/corporate use with organizational login
- Call tracking is essential for CRM functionality (logging customer interactions)
- There is no alternative method to achieve this core functionality without 
  READ_CALL_LOG permission
- The app provides clear value to businesses for sales team management
- All data is handled in compliance with Google Play's User Data Policy
```

**6. How do you ensure user privacy and data security?**
```
PRIVACY SAFEGUARDS:
1. Prominent disclosure shown before requesting permission
2. Users must explicitly consent to call tracking feature
3. Call data is encrypted in transit (HTTPS) and at rest (Firestore encryption)
4. Data is scoped to the user's organization (multi-tenant architecture)
5. Users can disable call tracking and delete their data
6. Privacy policy clearly explains data collection and use

DATA HANDLING:
- Call data is only used for CRM record-keeping within the organization
- No data is sold or shared with third parties
- No advertising or profiling based on call data
- Data is deleted when user account is deleted
```

---

## Part 4: Alternative Approaches (If Permission Denied)

### Option 1: Manual Call Logging

Remove READ_CALL_LOG permission and require users to manually log calls:

**Pros:**
- No permission declaration required
- Faster Play Store approval

**Cons:**
- Poor user experience
- Incomplete data (users forget to log)
- Reduced app value

### Option 2: Default Dialer Integration

Make the app a **Default Phone Handler**:

**Implementation:**
1. Add dialer functionality to the app
2. Register as default phone handler
3. Gain legitimate access to READ_CALL_LOG

**Pros:**
- Fully compliant with Google Play policy
- Enhanced functionality (make calls from app)

**Cons:**
- Significant development effort
- Must be registered as default before requesting permission
- Must stop using permission when no longer default handler

### Option 3: CallLog Content Provider with User Consent

Use Android's CallLog API with explicit user consent each time:

```java
// Request permission only when needed
if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) 
    != PackageManager.PERMISSION_GRANTED) {
    
    // Show explanation dialog
    new AlertDialog.Builder(this)
        .setTitle("Call Tracking Permission")
        .setMessage("To log your call details, we need access to your call history.")
        .setPositiveButton("Allow", (dialog, which) -> {
            ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.READ_CALL_LOG},
                REQUEST_CALL_LOG);
        })
        .setNegativeButton("Skip", null)
        .show();
}
```

---

## Part 5: Required Documentation for Play Console

### 1. Privacy Policy (Required)

Create a privacy policy that includes:

```
PRIVACY POLICY - CodeSkate

Last Updated: [Date]

1. INFORMATION WE COLLECT
   - Call log data (phone number, call duration, call type)
   - Contact information (leads, customers)
   - Usage data (login times, feature usage)

2. HOW WE USE YOUR INFORMATION
   - To provide CRM functionality for your organization
   - To log customer interactions automatically
   - To generate sales analytics and reports

3. DATA SHARING
   - Data is NOT sold to third parties
   - Data is shared only within your organization
   - Data may be shared with service providers (Firebase, etc.)

4. DATA SECURITY
   - All data encrypted in transit and at rest
   - Access restricted to authorized organization members
   - Regular security audits

5. USER RIGHTS
   - Right to access your data
   - Right to delete your data
   - Right to disable call tracking
   - Right to export your data

6. CONTACT
   - Email: [your-email]
   - Website: [your-website]
```

### 2. Prominent Disclosure (Required)

Show this dialog before requesting permissions:

```java
// Before requesting READ_CALL_LOG
new AlertDialog.Builder(this)
    .setTitle("Enable Call Tracking?")
    .setMessage("CodeSkate can automatically log your calls to customer leads. " +
                "This helps you keep accurate records of all customer interactions.\n\n" +
                "We will access:\n" +
                "• Phone numbers you call/receive\n" +
                "• Call duration\n" +
                "• Call type (incoming/outgoing)\n\n" +
                "This data will be stored securely and used only for CRM purposes.")
    .setPositiveButton("Enable Call Tracking", (dialog, which) -> {
        // Request permission
        requestCallLogPermission();
    })
    .setNegativeButton("Not Now", null)
    .setNeutralButton("Learn More", (dialog, which) -> {
        // Open privacy policy
        openPrivacyPolicy();
    })
    .show();
```

### 3. In-App Permission Explanation

Add a settings screen that explains:

```jsx
// lead-erp/src/pages/admin/Settings.jsx

<div className="bg-white rounded-lg shadow-card border border-paper-line p-5">
  <p className="eyebrow mb-3">Call Tracking</p>
  <p className="text-sm text-ink/50 mb-3">
    Automatically log calls to leads in your CRM
  </p>
  
  <div className="flex items-center justify-between">
    <div className="text-sm">
      <p className="font-medium">Enable call tracking</p>
      <p className="text-ink/40 text-xs mt-1">
        Requires access to call history
      </p>
    </div>
    <button 
      onClick={requestCallTracking}
      className="bg-ink text-white px-4 py-2 rounded text-sm"
    >
      Enable
    </button>
  </div>
  
  <p className="text-xs text-ink/30 mt-3">
    Your call data is encrypted and only visible to your organization.
  </p>
</div>
```

---

## Part 6: Step-by-Step Play Console Submission

### Step 1: Prepare Your App

1. Remove unnecessary permissions from AndroidManifest.xml
2. Add prominent disclosure dialogs
3. Create privacy policy page
4. Test permission flow on real device

### Step 2: Upload to Play Console

1. Go to **Play Console** → Your App → **Release** → **Production**
2. Click **Create new release**
3. Upload your Android App Bundle (.aab)
4. Google Play will detect the permissions and prompt for declaration

### Step 3: Fill Permissions Declaration Form

When prompted:

1. **Select permissions:** READ_CALL_LOG, READ_PHONE_STATE
2. **Select use case:** Enterprise CRM
3. **Provide justification:** (use template from Part 3)
4. **Upload documentation:**
   - Screenshots of prominent disclosure
   - Privacy policy URL
   - Video demonstrating permission use (optional but helpful)

### Step 4: Submit for Review

- Review typically takes 2-7 days
- Google may request additional information
- Be prepared to provide:
  - Business registration documents
  - Explanation of CRM functionality
  - Demo video of call tracking feature

---

## Part 7: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Permission denied | Medium | High | Prepare alternative implementation |
| Extended review time | High | Medium | Submit early, have patience |
| Policy change | Low | High | Monitor policy updates, be ready to adapt |
| User backlash | Low | Medium | Clear prominent disclosure, easy opt-out |

---

## Part 8: Post-Approval Requirements

Once approved, you must:

1. ✅ Maintain privacy policy with accurate information
2. ✅ Only use permissions for declared purposes
3. ✅ Update declaration if functionality changes
4. ✅ Provide users with data access/deletion options
5. ✅ Monitor for policy changes and adapt accordingly

**⚠️ WARNING:** Deceptive or non-declared use of permissions can result in:
- App suspension
- Developer account termination
- Permanent ban from Google Play

---

## Summary

**For Google Play approval, you need to:**

1. ✅ Qualify as **Enterprise CRM** (business use with corporate login)
2. ✅ Provide **prominent disclosure** before requesting permissions
3. ✅ Link to **privacy policy** in Play Store listing
4. ✅ Fill out **Permissions Declaration Form** with accurate justification
5. ✅ Demonstrate call tracking is **core functionality**
6. ✅ Ensure data is **NOT sold or used for advertising**

**Your app is likely to be approved because:**
- It's a legitimate business CRM application
- Call tracking is essential for CRM record-keeping
- No alternative exists for automatic call logging
- Clear privacy policy and user consent flow
- Data is not sold or used for profiling

---

**Document End**
