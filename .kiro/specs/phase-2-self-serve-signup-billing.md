# Phase 2: Self-Serve Organization Signup & Razorpay Billing

**Status:** Draft
**Phase:** 2 of N
**Last Updated:** 2025-07-16
**Prerequisites:** Phase 1 (Multi-Tenant Foundation) must be completed

---

## Executive Summary

This specification extends the Phase 1 multi-tenant foundation with:
1. **Self-Serve Organization Signup** — Allow any user to create a new organization
2. **Razorpay Subscription Billing** — Recurring payments with plan tiers
3. **Per-Seat Pricing Enforcement** — Limit active members based on subscription
4. **14-Day Free Trial** — Full access before payment required

### Key Outcomes
- New users can self-register and create their own organization
- Subscription billing integrates with Razorpay Payments API
- Seat limits are enforced at the database level (Security Rules + Cloud Functions)
- Grace period and dunning handling for failed payments

---

## Current State Analysis

### Existing Admin-Only User Creation Flow

**Location:** `lead-erp/src/pages/admin/Employees.jsx`

```jsx
// Current flow (admin-only):
const create = (e) => {
  e.preventDefault();
  const cleanPhone = form.phone.replace(/\D/g, "");
  if (cleanPhone.length !== 10) { alert("Sahi 10-digit mobile number daalo."); return; }
  if (users.some((u) => u.phone === cleanPhone)) { alert("Ye number already registered hai."); return; }
  addUser({ ...form, phone: cleanPhone, active: true });
  // ...
};
```

**Problems with Current Flow:**
1. Admin must manually provision every user
2. No invite mechanism — user must be told their account was created
3. No email verification or onboarding flow
4. No billing or seat limits
5. User discovers account by trying to log in

### Current Data Model (Phase 1)

```
organizations/{orgId}
├── name, slug, createdAt, createdBy
└── settings/config

memberships/{uid}_{orgId}
├── uid, orgId, role, displayName, active
└── invitedBy, joinedAt, lastActiveAt

users/{uid}
├── phone, displayName, defaultOrgId
└── createdAt, lastLoginAt
```

**Missing for Billing:**
- No subscription/plan information
- No billing history
- No seat limit tracking
- No trial period management

---

## Target Data Model

### New Collections

```
plans/{planId}                                   # Global plan definitions
├── name: "Starter" | "Growth" | "Enterprise"
├── monthlyPrice: 999 | 2499 | 4999 (INR)
├── yearlyPrice: 9999 | 24999 | 49999 (INR)
├── includedSeats: 3 | 10 | 50
├── pricePerSeat: 299 | 199 | 99 (INR per additional seat)
├── features: { ... }
├── isActive: boolean
└── displayOrder: number

subscriptions/{subscriptionId}                   # Organization subscription
├── orgId: string
├── planId: string
├── status: "trialing" | "active" | "past_due" | "canceled" | "expired"
├── currentPeriodStart: timestamp
├── currentPeriodEnd: timestamp
├── trialEndsAt: timestamp
├── cancelAtPeriodEnd: boolean
├── razorpaySubscriptionId: string
├── razorpayCustomerId: string
├── seatsUsed: number
├── seatsLimit: number
└── billingEmail: string

invoices/{invoiceId}                             # Billing history
├── orgId: string
├── subscriptionId: string
├── razorpayInvoiceId: string
├── amount: number
├── currency: "INR"
├── status: "draft" | "issued" | "paid" | "void"
├── issuedAt: timestamp
├── paidAt: timestamp
└── downloadUrl: string

invitations/{invitationId}                       # Pending invitations
├── orgId: string
├── email: string (optional)
├── phone: string (optional)
├── role: "admin" | "employee"
├── invitedBy: uid
├── invitedAt: timestamp
├── expiresAt: timestamp
├── acceptedAt: timestamp
├── acceptedBy: uid
└── status: "pending" | "accepted" | "expired"
```

### Updated Organization Document

```
organizations/{orgId}
├── name: string
├── slug: string
├── createdAt: timestamp
├── createdBy: uid
├── subscriptionId: string (FK to subscriptions)
├── seatsUsed: number (denormalized, updated by Cloud Function)
├── seatsLimit: number (denormalized, updated by Cloud Function)
├── planName: string (denormalized for quick display)
└── trialEndsAt: timestamp (denormalized)
```

---

## Pricing Plans

### Tier Structure

| Plan | Monthly (INR) | Yearly (INR) | Included Seats | Per-Seat | Features |
|------|---------------|--------------|----------------|----------|----------|
| **Starter** | ₹999/mo | ₹9,999/yr (save ₹2,000) | 3 | ₹299/seat | Basic lead management, WhatsApp integration, 1,000 leads/month |
| **Growth** | ₹2,499/mo | ₹24,999/yr (save ₹5,000) | 10 | ₹199/seat | All Starter + Goals, Activity logs, 10,000 leads/month, Priority support |
| **Enterprise** | ₹4,999/mo | ₹49,999/yr (save ₹10,000) | 50 | ₹99/seat | All Growth + Unlimited leads, Custom roles, API access, Dedicated support |

### Free Trial

- **Duration:** 14 days
- **Plan:** Full Growth plan features
- **Seats:** Up to 5 during trial
- **No credit card required** for trial start
- **Auto-downgrade** to Starter after trial if no payment

---

## Self-Serve Signup Flow

### User Journey

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1: Landing Page                              │
│  - View pricing plans                                                │
│  - Click "Start Free Trial"                                          │
│  - No authentication required yet                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 2: Account Creation                          │
│  - Enter phone number                                                │
│  - Firebase Phone OTP verification                                   │
│  - Create users/{uid} document                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 3: Organization Setup                        │
│  - Organization name                                                 │
│  - Organization slug (URL-safe, uniqueness check)                    │
│  - Admin name & role selection                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 4: Plan Selection                            │
│  - View all plans with features                                      │
│  - Select monthly/yearly billing                                     │
│  - See trial terms (14 days free)                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 5: Payment (Optional)                        │
│  - Option to skip payment and start trial                            │
│  - Or enter payment via Razorpay Checkout                            │
│  - Store Razorpay customer ID                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 6: Dashboard                                 │
│  - Organization created                                              │
│  - Membership created (owner role)                                   │
│  - Subscription created (trialing status)                            │
│  - Trial countdown shown in UI                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### React Component Flow

```jsx
// New signup flow (self-serve):

// 1. /signup - Landing page
<SignupLanding plans={plans} />

// 2. /signup/auth - Phone verification
<SignupAuth onSubmit={handlePhoneVerify} />

// 3. /signup/organization - Org details
<SignupOrganization onSubmit={handleOrgCreate} />

// 4. /signup/plan - Plan selection
<SignupPlanSelection plans={plans} onSelect={handlePlanSelect} />

// 5. /signup/payment - Razorpay checkout (optional)
<SignupPayment plan={selectedPlan} onSkip={startTrial} />

// 6. /app - Dashboard
<Dashboard />
```



---

## Razorpay Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                             │
│  - Razorpay Checkout.js integration                                 │
│  - Plan selection UI                                                 │
│  - Invoice history view                                              │
│  - Subscription management (upgrade/downgrade/cancel)                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Checkout API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                         │
│  - Create Razorpay subscription                                     │
│  - Handle webhook events (payment.success, subscription.charged)    │
│  - Update Firestore subscription status                              │
│  - Generate invoices                                                 │
│  - Enforce seat limits                                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RAZORPAY API                                      │
│  - Customers                                                         │
│  - Subscriptions (recurring billing)                                 │
│  - Plans (created in Razorpay dashboard)                             │
│  - Invoices (auto-generated)                                         │
│  - Webhooks (event notifications)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Razorpay Resources to Create

#### 1. Plans (Created via Razorpay Dashboard or API)

```javascript
// Create plan in Razorpay (one-time setup)
const starterMonthlyPlan = await razorpay.plans.create({
  period: 'monthly',
  interval: 1,
  item: {
    name: 'Starter Plan - Monthly',
    amount: 99900, // ₹999 in paise
    currency: 'INR',
    description: 'Basic lead management for small teams',
  },
});

const starterYearlyPlan = await razorpay.plans.create({
  period: 'yearly',
  interval: 1,
  item: {
    name: 'Starter Plan - Yearly',
    amount: 999900, // ₹9,999 in paise
    currency: 'INR',
    description: 'Basic lead management for small teams (Annual)',
  },
});
```

#### 2. Subscription Creation (Backend API)

```javascript
// POST /api/billing/create-subscription
export async function createSubscription(req, res) {
  const { orgId, planId, billingCycle } = req.body;
  
  // 1. Get plan details from Firestore
  const plan = await db.collection('plans').doc(planId).get();
  
  // 2. Check for existing subscription
  const existingSub = await db.collection('subscriptions')
    .where('orgId', '==', orgId)
    .where('status', 'in', ['trialing', 'active'])
    .get();
  
  if (!existingSub.empty) {
    return res.status(400).json({ error: 'Active subscription already exists' });
  }
  
  // 3. Create Razorpay subscription
  const razorpayPlanId = billingCycle === 'yearly' 
    ? plan.data().razorpayYearlyPlanId 
    : plan.data().razorpayMonthlyPlanId;
  
  const subscription = await razorpay.subscriptions.create({
    plan_id: razorpayPlanId,
    customer_notify: 1,
    total_count: billingCycle === 'yearly' ? 1 : 12,
    addons: [], // Per-seat addons added dynamically
    notes: {
      orgId: orgId,
      planId: planId,
    },
  });
  
  // 4. Create subscription document in Firestore
  const subscriptionRef = await db.collection('subscriptions').add({
    orgId,
    planId,
    status: 'created',
    razorpaySubscriptionId: subscription.id,
    razorpayCustomerId: null,
    seatsUsed: 1, // Owner counts as 1 seat
    seatsLimit: plan.data().includedSeats,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    billingEmail: null,
    createdAt: new Date().toISOString(),
  });
  
  // 5. Update organization with subscription reference
  await db.collection('organizations').doc(orgId).update({
    subscriptionId: subscriptionRef.id,
    seatsUsed: 1,
    seatsLimit: plan.data().includedSeats,
    planName: plan.data().name,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
  
  res.json({
    subscriptionId: subscriptionRef.id,
    razorpaySubscriptionId: subscription.id,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
```

#### 3. Webhook Handler (Backend API)

```javascript
// POST /api/webhooks/razorpay
export async function handleRazorpayWebhook(req, res) {
  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (webhookSignature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  const { entity, payload } = event;
  
  switch (entity) {
    case 'subscription':
      await handleSubscriptionEvent(payload.subscription.entity);
      break;
    case 'payment':
      await handlePaymentEvent(payload.payment.entity);
      break;
    case 'invoice':
      await handleInvoiceEvent(payload.invoice.entity);
      break;
  }
  
  res.json({ received: true });
}

async function handleSubscriptionEvent(subscription) {
  const orgId = subscription.notes.orgId;
  
  // Find subscription by Razorpay ID
  const subSnap = await db.collection('subscriptions')
    .where('razorpaySubscriptionId', '==', subscription.id)
    .limit(1)
    .get();
  
  if (subSnap.empty) return;
  
  const subRef = subSnap.docs[0].ref;
  
  // Update subscription status
  await subRef.update({
    status: mapRazorpayStatus(subscription.status),
    currentPeriodStart: new Date(subscription.current_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_end * 1000).toISOString(),
    razorpayCustomerId: subscription.customer_id,
  });
  
  // Update organization
  await db.collection('organizations').doc(orgId).update({
    subscriptionStatus: mapRazorpayStatus(subscription.status),
  });
}

function mapRazorpayStatus(razorpayStatus) {
  const statusMap = {
    'created': 'trialing',
    'authenticated': 'active',
    'active': 'active',
    'pending': 'past_due',
    'halted': 'past_due',
    'cancelled': 'canceled',
    'completed': 'expired',
  };
  return statusMap[razorpayStatus] || 'past_due';
}
```

---

## Seat Limit Enforcement

### Enforcement Strategy

Seat limits are enforced at **three levels**:

1. **UI Level** (User Experience) — Show warning, disable "Add Employee" button
2. **Security Rules Level** (Hard Limit) — Block writes if limit exceeded
3. **Cloud Functions Level** (Background Validation) — Re-validate and alert

### Level 1: UI Enforcement

```jsx
// lead-erp/src/pages/admin/Employees.jsx

export default function Employees() {
  const { users, settings } = useData();
  const { seatsUsed, seatsLimit, planName, trialEndsAt } = useSubscription();
  
  const canAddEmployee = seatsUsed < seatsLimit;
  const trialDaysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)));
  
  return (
    <Layout title="Employee Performance & Management">
      {/* Seat Usage Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-blue-900">
              Seats: {seatsUsed} / {seatsLimit} used
            </p>
            {trialEndsAt && (
              <p className="text-xs text-blue-700 mt-1">
                Trial ends in {trialDaysLeft} days — Upgrade to add more seats
              </p>
            )}
          </div>
          <Link to="/billing" className="text-blue-600 text-sm font-medium hover:underline">
            Manage Plan →
          </Link>
        </div>
      </div>
      
      {/* Add Employee Button */}
      <button 
        onClick={() => setShowForm(true)} 
        disabled={!canAddEmployee}
        className={`px-4 py-2 rounded-md text-sm ${canAddEmployee ? 'bg-ink text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
      >
        {canAddEmployee ? '+ Add employee' : `Seat limit reached (${seatsLimit}/${seatsLimit})`}
      </button>
      
      {/* Upgrade Modal */}
      {!canAddEmployee && (
        <UpgradeModal 
          message="You've reached your seat limit. Upgrade your plan to add more team members."
          currentPlan={planName}
        />
      )}
    </Layout>
  );
}
```

### Level 2: Security Rules Enforcement

```javascript
// firestore.rules — Updated for seat limits

match /memberships/{membershipId} {
  // ... existing rules ...
  
  // CREATE: Check seat limit before allowing new membership
  allow create: if isAuthenticated() && (
    // Self-registration (owner creating first membership during signup)
    (request.resource.data.uid == request.auth.uid && 
     request.resource.data.role == 'owner' &&
     // First membership doesn't count against seat limit
     !exists(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(request.resource.data.orgId))) ||
    
    // Admin adding member - MUST check seat limit
    (isAdmin(request.resource.data.orgId) && 
     request.auth.uid != request.resource.data.uid &&
     hasAvailableSeats(request.resource.data.orgId))
  );
}

// Helper function to check seat availability
function hasAvailableSeats(orgId) {
  let orgDoc = get(/databases/$(database)/documents/organizations/$(orgId));
  
  // If org has no subscription (shouldn't happen, but safety check)
  if (!orgDoc.exists) return false;
  
  // Get current seat count
  let seatsUsed = orgDoc.data().seatsUsed || 0;
  let seatsLimit = orgDoc.data().seatsLimit || 0;
  
  // Allow if under limit
  return seatsUsed < seatsLimit;
}
```

### Level 3: Cloud Functions Validation

```javascript
// functions/src/seatLimitEnforcer.js

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

/**
 * Triggered when a membership is created
 * Validates seat limit and alerts if exceeded
 */
export const validateSeatLimitOnMembershipCreate = functions.firestore
  .document('memberships/{membershipId}')
  .onCreate(async (snap, context) => {
    const membership = snap.data();
    const { orgId, uid } = membership;
    
    // Get organization
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) {
      console.error(`Organization ${orgId} not found`);
      return;
    }
    
    const org = orgDoc.data();
    
    // Count active memberships for this org
    const membershipsSnap = await db.collection('memberships')
      .where('orgId', '==', orgId)
      .where('active', '==', true)
      .get();
    
    const actualSeatsUsed = membershipsSnap.size;
    
    // Update seatsUsed in organization (keep it accurate)
    await db.collection('organizations').doc(orgId).update({
      seatsUsed: actualSeatsUsed,
    });
    
    // Check if over limit
    if (actualSeatsUsed > org.seatsLimit) {
      console.warn(`Seat limit exceeded for org ${orgId}: ${actualSeatsUsed}/${org.seatsLimit}`);
      
      // Send alert to org admins
      await sendSeatLimitAlert(orgId, actualSeatsUsed, org.seatsLimit);
      
      // Optionally: Deactivate oldest non-owner membership (strict enforcement)
      // await enforceSeatLimit(orgId, org.seatsLimit);
    }
  });

/**
 * Send email notification to org admins about seat limit
 */
async function sendSeatLimitAlert(orgId, seatsUsed, seatsLimit) {
  // Get all admins for this org
  const adminsSnap = await db.collection('memberships')
    .where('orgId', '==', orgId)
    .where('role', 'in', ['admin', 'owner'])
    .where('active', '==', true)
    .get();
  
  // Get user emails
  const adminUids = adminsSnap.docs.map(d => d.data().uid);
  
  // In a real implementation, send email via SendGrid/Mailgun
  console.log(`Sending seat limit alert to admins: ${adminUids.join(', ')}`);
  
  // For now, create an in-app notification
  for (const uid of adminUids) {
    await db.collection('organizations').doc(orgId).collection('notifications').add({
      userId: uid,
      text: `⚠️ Seat limit exceeded: ${seatsUsed}/${seatsLimit} seats used. Upgrade your plan to add more team members.`,
      type: 'billing',
      read: false,
      at: new Date().toISOString(),
    });
  }
}
```



---

## Frontend Components

### New Components Structure

```
lead-erp/src/
├── pages/
│   ├── signup/
│   │   ├── Landing.jsx           # Pricing page with plan cards
│   │   ├── Auth.jsx              # Phone verification step
│   │   ├── Organization.jsx      # Org name/slug setup
│   │   ├── PlanSelection.jsx     # Choose plan + billing cycle
│   │   ├── Payment.jsx           # Razorpay checkout (optional)
│   │   └── Success.jsx           # Success page + next steps
│   └── billing/
│       ├── Overview.jsx          # Current plan, usage, trial countdown
│       ├── Plans.jsx             # Upgrade/downgrade options
│       ├── History.jsx           # Invoice history
│       └── Cancel.jsx            # Cancel subscription flow
├── components/
│   ├── billing/
│   │   ├── PlanCard.jsx          # Individual plan card component
│   │   ├── TrialBanner.jsx       # Trial countdown banner
│   │   ├── SeatUsage.jsx         # Seat usage progress bar
│   │   ├── UpgradeModal.jsx      # Modal for upgrade prompts
│   │   └── InvoiceRow.jsx        # Invoice history row
│   └── signup/
│       └── ProgressBar.jsx       # Multi-step progress indicator
├── context/
│   └── BillingContext.jsx        # Subscription state management
└── hooks/
    └── useRazorpay.js            # Razorpay Checkout.js hook
```

### BillingContext.jsx

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

const BillingContext = createContext();
export const useSubscription = () => useContext(BillingContext);

export function BillingProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.activeOrgId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    // Listen to organization document for subscription info
    const unsub = onSnapshot(
      doc(db, 'organizations', user.activeOrgId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSubscription({
            subscriptionId: data.subscriptionId,
            seatsUsed: data.seatsUsed || 1,
            seatsLimit: data.seatsLimit || 3,
            planName: data.planName || 'Starter',
            trialEndsAt: data.trialEndsAt,
            subscriptionStatus: data.subscriptionStatus || 'trialing',
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('Subscription listener error:', err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user]);

  // Derived values
  const isTrialing = subscription?.subscriptionStatus === 'trialing';
  const isActive = subscription?.subscriptionStatus === 'active';
  const isPastDue = subscription?.subscriptionStatus === 'past_due';
  const seatsAvailable = subscription ? subscription.seatsLimit - subscription.seatsUsed : 0;
  const canAddSeats = seatsAvailable > 0;
  
  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <BillingContext.Provider value={{
      subscription,
      loading,
      isTrialing,
      isActive,
      isPastDue,
      seatsAvailable,
      canAddSeats,
      trialDaysLeft,
    }}>
      {children}
    </BillingContext.Provider>
  );
}
```

### useRazorpay Hook

```jsx
import { useState } from 'react';

export function useRazorpay() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => setError('Failed to load payment gateway');
      document.body.appendChild(script);
    });
  };

  const openCheckout = async (options) => {
    setLoading(true);
    setError(null);

    try {
      const Razorpay = await loadRazorpay();

      return new Promise((resolve, reject) => {
        const rzp = new Razorpay({
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          ...options,
          handler: (response) => {
            setLoading(false);
            resolve(response);
          },
          theme: {
            color: '#1a1a1a',
          },
        });

        rzp.on('payment.failed', (response) => {
          setLoading(false);
          setError(response.error.description);
          reject(new Error(response.error.description));
        });

        rzp.open();
      });
    } catch (err) {
      setLoading(false);
      setError(err.message);
      throw err;
    }
  };

  return { openCheckout, loading, error };
}
```

### Signup Landing Page

```jsx
// lead-erp/src/pages/signup/Landing.jsx

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';

export default function SignupLanding() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const navigate = useNavigate();

  const plans = [
    {
      name: 'Starter',
      monthlyPrice: 999,
      yearlyPrice: 9999,
      includedSeats: 3,
      features: [
        { text: 'Up to 1,000 leads/month', included: true },
        { text: 'WhatsApp integration', included: true },
        { text: 'Basic lead management', included: true },
        { text: 'Mobile app access', included: true },
        { text: 'Goals & activity logs', included: false },
        { text: 'Priority support', included: false },
      ],
    },
    {
      name: 'Growth',
      monthlyPrice: 2499,
      yearlyPrice: 24999,
      includedSeats: 10,
      popular: true,
      features: [
        { text: 'Up to 10,000 leads/month', included: true },
        { text: 'Everything in Starter', included: true },
        { text: 'Goals & activity logs', included: true },
        { text: 'Priority email support', included: true },
        { text: 'Custom roles', included: false },
        { text: 'API access', included: false },
      ],
    },
    {
      name: 'Enterprise',
      monthlyPrice: 4999,
      yearlyPrice: 49999,
      includedSeats: 50,
      features: [
        { text: 'Unlimited leads', included: true },
        { text: 'Everything in Growth', included: true },
        { text: 'Custom roles', included: true },
        { text: 'API access', included: true },
        { text: 'Dedicated support', included: true },
        { text: 'SLA guarantee', included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink to-ink/95">
      {/* Header */}
      <header className="py-6 px-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-2xl font-display font-bold">CodeSkate</h1>
          <Link to="/login" className="text-white/70 hover:text-white text-sm">
            Already have an account? Sign in →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-white text-5xl font-display font-bold mb-4">
          Simple Pricing for Growing Teams
        </h2>
        <p className="text-white/60 text-xl mb-8">
          Start with a 14-day free trial. No credit card required.
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex bg-white/10 rounded-lg p-1 mb-12">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition ${billingCycle === 'monthly' ? 'bg-white text-ink' : 'text-white/70'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition ${billingCycle === 'yearly' ? 'bg-white text-ink' : 'text-white/70'}`}
          >
            Yearly <span className="text-xs text-ok ml-1">Save 17%</span>
          </button>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-xl p-6 relative ${plan.popular ? 'ring-2 ring-signal' : ''}`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-signal text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </span>
              )}

              <h3 className="text-ink text-xl font-display font-bold mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold">
                  ₹{billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                </span>
                <span className="text-ink/50">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
              </div>

              <p className="text-ink/60 text-sm mb-6">
                {plan.includedSeats} seats included
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className={`flex items-center gap-2 text-sm ${feature.included ? 'text-ink' : 'text-ink/40'}`}>
                    {feature.included ? (
                      <Check className="w-4 h-4 text-ok" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    {feature.text}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate('/signup/auth', { state: { plan: plan.name, billingCycle } })}
                className={`w-full py-3 rounded-lg font-medium transition ${
                  plan.popular
                    ? 'bg-ink text-white hover:bg-ink/90'
                    : 'bg-paper text-ink hover:bg-paper/80'
                }`}
              >
                Start Free Trial
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-white text-2xl font-display font-bold text-center mb-8">
            Frequently Asked Questions
          </h3>
          
          <div className="space-y-4">
            <details className="bg-white/10 rounded-lg p-4 text-white">
              <summary className="font-medium cursor-pointer">What happens after my trial ends?</summary>
              <p className="mt-3 text-white/70">
                After 14 days, you'll be downgraded to the Starter plan if you haven't subscribed. 
                Your data is preserved, but you'll need to upgrade to add more team members or access premium features.
              </p>
            </details>
            
            <details className="bg-white/10 rounded-lg p-4 text-white">
              <summary className="font-medium cursor-pointer">Can I change my plan later?</summary>
              <p className="mt-3 text-white/70">
                Yes! You can upgrade or downgrade your plan at any time. Upgrades take effect immediately, 
                and downgrades apply at the end of your billing period.
              </p>
            </details>
            
            <details className="bg-white/10 rounded-lg p-4 text-white">
              <summary className="font-medium cursor-pointer">What payment methods do you accept?</summary>
              <p className="mt-3 text-white/70">
                We accept all major credit/debit cards, UPI, net banking, and wallets through Razorpay.
              </p>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}
```



---

## Backend API Implementation

### New API Endpoints

```javascript
// whatsapp-backend/routes/billing.js

import express from 'express';
import { db } from '../firebase-admin-init.js';
import Razorpay from 'razorpay';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================================
// GET /api/billing/plans
// Returns available plans with pricing
// ============================================================
router.get('/plans', async (req, res) => {
  try {
    const plansSnap = await db.collection('plans')
      .where('isActive', '==', true)
      .orderBy('displayOrder')
      .get();

    const plans = plansSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Don't expose internal Razorpay IDs to client
      razorpayMonthlyPlanId: undefined,
      razorpayYearlyPlanId: undefined,
    }));

    res.json({ plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// ============================================================
// POST /api/billing/create-subscription
// Creates a new subscription (with 14-day trial)
// ============================================================
router.post('/create-subscription', async (req, res) => {
  const { orgId, planId, billingCycle, billingEmail } = req.body;
  const uid = req.user?.uid; // From auth middleware

  if (!uid || !orgId || !planId || !billingCycle) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Verify user is owner of org
    const membershipDoc = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membershipDoc.exists || membershipDoc.data().role !== 'owner') {
      return res.status(403).json({ error: 'Only organization owner can create subscription' });
    }

    // 2. Check for existing active subscription
    const existingSub = await db.collection('subscriptions')
      .where('orgId', '==', orgId)
      .where('status', 'in', ['trialing', 'active', 'past_due'])
      .get();

    if (!existingSub.empty) {
      return res.status(400).json({ error: 'Active subscription already exists' });
    }

    // 3. Get plan details
    const planDoc = await db.collection('plans').doc(planId).get();
    if (!planDoc.exists) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const plan = planDoc.data();

    // 4. Create Razorpay subscription
    const razorpayPlanId = billingCycle === 'yearly'
      ? plan.razorpayYearlyPlanId
      : plan.razorpayMonthlyPlanId;

    const razorpaySubscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      total_count: billingCycle === 'yearly' ? 1 : 12,
      notes: {
        orgId: orgId,
        planId: planId,
        billingCycle: billingCycle,
      },
    });

    // 5. Create subscription document in Firestore
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const subscriptionRef = await db.collection('subscriptions').add({
      orgId,
      planId,
      status: 'trialing',
      razorpaySubscriptionId: razorpaySubscription.id,
      razorpayCustomerId: null,
      seatsUsed: 1,
      seatsLimit: plan.includedSeats,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: trialEndsAt.toISOString(),
      cancelAtPeriodEnd: false,
      billingEmail: billingEmail || null,
      createdAt: new Date().toISOString(),
      createdBy: uid,
    });

    // 6. Update organization with subscription reference
    await db.collection('organizations').doc(orgId).update({
      subscriptionId: subscriptionRef.id,
      seatsUsed: 1,
      seatsLimit: plan.includedSeats,
      planName: plan.name,
      trialEndsAt: trialEndsAt.toISOString(),
      subscriptionStatus: 'trialing',
    });

    // 7. Log activity
    await db.collection('organizations').doc(orgId).collection('activity').add({
      text: `🎉 Subscription created: ${plan.name} plan (${billingCycle})`,
      at: new Date().toISOString(),
      orgId,
    });

    res.json({
      success: true,
      subscriptionId: subscriptionRef.id,
      razorpaySubscriptionId: razorpaySubscription.id,
      trialEndsAt: trialEndsAt.toISOString(),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // For frontend checkout
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// ============================================================
// POST /api/billing/add-seat
// Add per-seat billing addon
// ============================================================
router.post('/add-seat', async (req, res) => {
  const { orgId } = req.body;
  const uid = req.user?.uid;

  if (!uid || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Get current subscription
    const subSnap = await db.collection('subscriptions')
      .where('orgId', '==', orgId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (subSnap.empty) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const subDoc = subSnap.docs[0];
    const subscription = subDoc.data();

    // 2. Check if already at plan's included seats
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    const org = orgDoc.data();

    if (org.seatsUsed < org.seatsLimit) {
      // Still within included seats, no charge needed
      return res.json({ success: true, message: 'Seat available within current plan' });
    }

    // 3. Get plan to determine per-seat price
    const planDoc = await db.collection('plans').doc(subscription.planId).get();
    const plan = planDoc.data();

    // 4. Create addon in Razorpay
    const addon = await razorpay.subscriptions.createAddon(subscription.razorpaySubscriptionId, {
      item: {
        name: 'Additional Seat',
        amount: plan.pricePerSeat * 100, // Convert to paise
        currency: 'INR',
      },
      quantity: 1,
    });

    // 5. Update seats limit
    await subDoc.ref.update({
      seatsLimit: subscription.seatsLimit + 1,
    });

    await db.collection('organizations').doc(orgId).update({
      seatsLimit: org.seatsLimit + 1,
    });

    res.json({ success: true, newSeatsLimit: subscription.seatsLimit + 1 });

  } catch (error) {
    console.error('Error adding seat:', error);
    res.status(500).json({ error: 'Failed to add seat' });
  }
});

// ============================================================
// POST /api/billing/cancel
// Cancel subscription at period end
// ============================================================
router.post('/cancel', async (req, res) => {
  const { orgId, reason } = req.body;
  const uid = req.user?.uid;

  if (!uid || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Verify user is owner
    const membershipDoc = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membershipDoc.exists || membershipDoc.data().role !== 'owner') {
      return res.status(403).json({ error: 'Only organization owner can cancel subscription' });
    }

    // 2. Get subscription
    const subSnap = await db.collection('subscriptions')
      .where('orgId', '==', orgId)
      .where('status', 'in', ['trialing', 'active'])
      .limit(1)
      .get();

    if (subSnap.empty) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const subDoc = subSnap.docs[0];
    const subscription = subDoc.data();

    // 3. Cancel in Razorpay
    if (subscription.razorpaySubscriptionId) {
      await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId, {
        cancel_at_cycle_end: 1,
      });
    }

    // 4. Update Firestore
    await subDoc.ref.update({
      cancelAtPeriodEnd: true,
      cancelReason: reason || null,
      canceledBy: uid,
      canceledAt: new Date().toISOString(),
    });

    await db.collection('organizations').doc(orgId).update({
      cancelAtPeriodEnd: true,
    });

    res.json({ success: true, message: 'Subscription will cancel at end of billing period' });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ============================================================
// GET /api/billing/invoices/:orgId
// Get invoice history for organization
// ============================================================
router.get('/invoices/:orgId', async (req, res) => {
  const { orgId } = req.params;
  const uid = req.user?.uid;

  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify membership
    const membershipDoc = await db.collection('memberships')
      .doc(`${uid}_${orgId}`)
      .get();

    if (!membershipDoc.exists) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    const invoicesSnap = await db.collection('invoices')
      .where('orgId', '==', orgId)
      .orderBy('issuedAt', 'desc')
      .limit(24)
      .get();

    const invoices = invoicesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ invoices });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

export default router;
```

---

## Cloud Functions

### Required Cloud Functions

```javascript
// functions/src/index.js

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Razorpay from 'razorpay';

admin.initializeApp();

const db = admin.firestore();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================================
// Webhook Handler for Razorpay Events
// ============================================================
export const razorpayWebhook = functions.https.onRequest(async (req, res) => {
  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify signature
  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (webhookSignature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const eventType = event.event;

  console.log(`Received webhook event: ${eventType}`);

  try {
    switch (eventType) {
      case 'subscription.activated':
        await handleSubscriptionActivated(event.payload.subscription.entity);
        break;
      case 'subscription.charged':
        await handleSubscriptionCharged(event.payload.subscription.entity, event.payload.payment.entity);
        break;
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;
      case 'subscription.halted':
        await handleSubscriptionHalted(event.payload.subscription.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.payload.invoice.entity);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Handler failed' });
  }
});

async function handleSubscriptionActivated(subscription) {
  const orgId = subscription.notes?.orgId;
  if (!orgId) return;

  const subSnap = await db.collection('subscriptions')
    .where('razorpaySubscriptionId', '==', subscription.id)
    .limit(1)
    .get();

  if (subSnap.empty) return;

  const subRef = subSnap.docs[0].ref;

  await subRef.update({
    status: 'active',
    currentPeriodStart: new Date(subscription.current_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_end * 1000).toISOString(),
    razorpayCustomerId: subscription.customer_id,
  });

  await db.collection('organizations').doc(orgId).update({
    subscriptionStatus: 'active',
    trialEndsAt: null,
  });

  console.log(`Subscription activated for org ${orgId}`);
}

async function handleSubscriptionCharged(subscription, payment) {
  const orgId = subscription.notes?.orgId;
  if (!orgId) return;

  // Create invoice record
  await db.collection('invoices').add({
    orgId,
    razorpayInvoiceId: payment.invoice_id,
    amount: payment.amount / 100,
    currency: payment.currency,
    status: 'paid',
    issuedAt: new Date(payment.created_at * 1000).toISOString(),
    paidAt: new Date().toISOString(),
    paymentMethod: payment.method,
  });

  console.log(`Payment received for org ${orgId}: ₹${payment.amount / 100}`);
}

async function handleSubscriptionHalted(subscription) {
  const orgId = subscription.notes?.orgId;
  if (!orgId) return;

  const subSnap = await db.collection('subscriptions')
    .where('razorpaySubscriptionId', '==', subscription.id)
    .limit(1)
    .get();

  if (subSnap.empty) return;

  await subSnap.docs[0].ref.update({ status: 'past_due' });

  await db.collection('organizations').doc(orgId).update({
    subscriptionStatus: 'past_due',
  });

  // Notify admins
  await sendPaymentFailedNotification(orgId);

  console.log(`Subscription halted for org ${orgId}`);
}

async function sendPaymentFailedNotification(orgId) {
  const adminsSnap = await db.collection('memberships')
    .where('orgId', '==', orgId)
    .where('role', 'in', ['admin', 'owner'])
    .where('active', '==', true)
    .get();

  const batch = db.batch();

  adminsSnap.docs.forEach(doc => {
    const notifRef = db.collection('organizations').doc(orgId).collection('notifications').doc();
    batch.set(notifRef, {
      userId: doc.data().uid,
      text: '⚠️ Payment failed. Please update your payment method to avoid service interruption.',
      type: 'billing',
      read: false,
      at: new Date().toISOString(),
    });
  });

  await batch.commit();
}

// ============================================================
// Trial Expiration Check (Runs daily at midnight)
// ============================================================
export const checkTrialExpirations = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const now = new Date();

    // Find all trialing subscriptions past their trial end
    const expiredTrials = await db.collection('subscriptions')
      .where('status', '==', 'trialing')
      .where('trialEndsAt', '<=', now.toISOString())
      .get();

    for (const doc of expiredTrials.docs) {
      const subscription = doc.data();
      const orgId = subscription.orgId;

      console.log(`Trial expired for org ${orgId}`);

      // Update subscription status
      await doc.ref.update({ status: 'expired' });

      // Update organization
      await db.collection('organizations').doc(orgId).update({
        subscriptionStatus: 'expired',
        seatsLimit: 1, // Downgrade to 1 seat (owner only)
      });

      // Notify owner
      const ownerMembership = await db.collection('memberships')
        .where('orgId', '==', orgId)
        .where('role', '==', 'owner')
        .limit(1)
        .get();

      if (!ownerMembership.empty) {
        await db.collection('organizations').doc(orgId).collection('notifications').add({
          userId: ownerMembership.docs[0].data().uid,
          text: '⚠️ Your trial has expired. Subscribe now to continue using all features.',
          type: 'billing',
          read: false,
          at: new Date().toISOString(),
        });
      }
    }

    console.log(`Processed ${expiredTrials.size} expired trials`);
  });

// ============================================================
// Seat Limit Enforcement (Triggered on membership create)
// ============================================================
export const enforceSeatLimit = functions.firestore
  .document('memberships/{membershipId}')
  .onCreate(async (snap, context) => {
    const membership = snap.data();
    const { orgId, uid } = membership;

    // Get organization
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) return;

    const org = orgDoc.data();

    // Count active memberships
    const membershipsSnap = await db.collection('memberships')
      .where('orgId', '==', orgId)
      .where('active', '==', true)
      .get();

    const actualSeatsUsed = membershipsSnap.size;

    // Update seatsUsed (keep accurate)
    await db.collection('organizations').doc(orgId).update({
      seatsUsed: actualSeatsUsed,
    });

    // Alert if over limit
    if (actualSeatsUsed > org.seatsLimit) {
      console.warn(`Seat limit exceeded for org ${orgId}: ${actualSeatsUsed}/${org.seatsLimit}`);

      // Send alert to admins
      const adminsSnap = await db.collection('memberships')
        .where('orgId', '==', orgId)
        .where('role', 'in', ['admin', 'owner'])
        .where('active', '==', true)
        .get();

      const batch = db.batch();

      adminsSnap.docs.forEach(doc => {
        const notifRef = db.collection('organizations').doc(orgId).collection('notifications').doc();
        batch.set(notifRef, {
          userId: doc.data().uid,
          text: `⚠️ Seat limit exceeded: ${actualSeatsUsed}/${org.seatsLimit} seats. Upgrade your plan.`,
          type: 'billing',
          read: false,
          at: new Date().toISOString(),
        });
      });

      await batch.commit();
    }
  });
```



---

## Updated Firestore Security Rules

```javascript
// firestore.rules — Updated for billing

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ... existing helper functions ...
    
    function hasActiveSubscription(orgId) {
      let orgDoc = get(/databases/$(database)/documents/organizations/$(orgId));
      let status = orgDoc.data().subscriptionStatus;
      return status == 'active' || status == 'trialing';
    }
    
    function hasAvailableSeats(orgId) {
      let orgDoc = get(/databases/$(database)/documents/organizations/$(orgId));
      let seatsUsed = orgDoc.data().seatsUsed || 0;
      let seatsLimit = orgDoc.data().seatsLimit || 0;
      return seatsUsed < seatsLimit;
    }
    
    // ============================================================
    // PLANS (Global, read-only for all authenticated users)
    // ============================================================
    
    match /plans/{planId} {
      allow read: if isAuthenticated();
      allow write: if false; // Only via admin SDK / Cloud Functions
    }
    
    // ============================================================
    // SUBSCRIPTIONS
    // ============================================================
    
    match /subscriptions/{subscriptionId} {
      // Read: org admins only
      allow read: if isAuthenticated() && 
                     isAdmin(resource.data.orgId);
      
      // Create: handled via Cloud Functions (webhook)
      allow create: if false;
      
      // Update: only via Cloud Functions
      allow update: if false;
      
      // Delete: not allowed
      allow delete: if false;
    }
    
    // ============================================================
    // INVOICES
    // ============================================================
    
    match /invoices/{invoiceId} {
      allow read: if isAuthenticated() && 
                     isAdmin(resource.data.orgId);
      allow write: if false; // Only via Cloud Functions
    }
    
    // ============================================================
    // INVITATIONS
    // ============================================================
    
    match /invitations/{invitationId} {
      // Read: org admins or invitation recipient
      allow read: if isAuthenticated() && (
        isAdmin(resource.data.orgId) ||
        request.auth.token.email == resource.data.email ||
        request.auth.token.phone == resource.data.phone
      );
      
      // Create: org admins only
      allow create: if isAuthenticated() && 
                      isAdmin(request.resource.data.orgId) &&
                      hasAvailableSeats(request.resource.data.orgId);
      
      // Update: accept invitation
      allow update: if isAuthenticated() && 
                      request.resource.data.acceptedBy == request.auth.uid;
      
      // Delete: org admins only
      allow delete: if isAuthenticated() && isAdmin(resource.data.orgId);
    }
    
    // ============================================================
    // MEMBERSHIPS (Updated for seat limits)
    // ============================================================
    
    match /memberships/{membershipId} {
      // ... existing read rules ...
      
      // CREATE: Check seat limit before allowing new membership
      allow create: if isAuthenticated() && (
        // Self-registration (owner creating first membership during signup)
        (request.resource.data.uid == request.auth.uid && 
         request.resource.data.role == 'owner' &&
         !exists(/databases/$(database)/documents/memberships/$(request.auth.uid)_$(request.resource.data.orgId))) ||
        
        // Admin adding member - MUST check seat limit AND active subscription
        (isAdmin(request.resource.data.orgId) && 
         request.auth.uid != request.resource.data.uid &&
         hasAvailableSeats(request.resource.data.orgId) &&
         hasActiveSubscription(request.resource.data.orgId))
      );
      
      // ... existing update/delete rules ...
    }
    
    // ============================================================
    // ORGANIZATIONS (Updated for subscription fields)
    // ============================================================
    
    match /organizations/{orgId} {
      // Read: must be a member
      allow read: if isAuthenticated() && hasActiveMembership(orgId);
      
      // Create: any authenticated user (self-serve signup)
      allow create: if isAuthenticated();
      
      // Update: admin only, but restrict sensitive fields
      allow update: if isAuthenticated() && isAdmin(orgId) && 
                      !request.resource.data.diff(resource.data)
                        .affectedKeys().hasAny(['seatsUsed', 'seatsLimit', 'subscriptionId', 'subscriptionStatus']);
      
      // Delete: owner only
      allow delete: if isAuthenticated() && isOwner(orgId);
      
      // ... existing subcollection rules ...
    }
  }
}
```

---

## Invitation Flow

### Invitation Creation (Admin → New User)

```javascript
// DataContext.jsx

const inviteUser = async (email, phone, role) => {
  if (!user?.activeOrgId) return;
  
  // Check seat availability
  if (!canAddSeats) {
    alert('Seat limit reached. Upgrade your plan to invite more team members.');
    return;
  }
  
  try {
    // Create invitation
    const invitationRef = await addDoc(collection(db, 'invitations'), {
      orgId: user.activeOrgId,
      email: email || null,
      phone: phone || null,
      role: role,
      invitedBy: user.uid,
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      status: 'pending',
    });
    
    // Send invitation via email/SMS (future implementation)
    // For now, just log the invitation link
    console.log(`Invitation link: ${window.location.origin}/invite/${invitationRef.id}`);
    
    logActivity(`Invited ${email || phone} to join organization as ${role}`);
    
    return invitationRef.id;
  } catch (e) {
    console.error('Error creating invitation:', e);
  }
};
```

### Invitation Acceptance Flow

```jsx
// lead-erp/src/pages/Invite.jsx

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

export default function AcceptInvitation() {
  const { invitationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInvitation();
  }, [invitationId]);

  async function loadInvitation() {
    try {
      const invDoc = await getDoc(doc(db, 'invitations', invitationId));
      
      if (!invDoc.exists()) {
        setError('Invitation not found');
        setLoading(false);
        return;
      }

      const invData = invDoc.data();
      
      // Check expiration
      if (new Date(invData.expiresAt) < new Date()) {
        setError('This invitation has expired');
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (invData.status === 'accepted') {
        setError('This invitation has already been accepted');
        setLoading(false);
        return;
      }

      setInvitation(invData);
      setLoading(false);
    } catch (e) {
      setError('Failed to load invitation');
      setLoading(false);
    }
  }

  async function acceptInvitation() {
    if (!user) {
      // Redirect to login with return URL
      navigate('/login', { state: { returnUrl: `/invite/${invitationId}` } });
      return;
    }

    try {
      // Create membership
      await setDoc(doc(db, 'memberships', `${user.uid}_${invitation.orgId}`), {
        uid: user.uid,
        orgId: invitation.orgId,
        role: invitation.role,
        displayName: user.displayName || 'Unknown',
        active: true,
        invitedBy: invitation.invitedBy,
        joinedAt: new Date().toISOString(),
        lastActiveAt: null,
      });

      // Update invitation status
      await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'accepted',
        acceptedBy: user.uid,
        acceptedAt: new Date().toISOString(),
      });

      // Update user's default org
      await updateDoc(doc(db, 'users', user.uid), {
        defaultOrgId: invitation.orgId,
      });

      // Navigate to dashboard
      navigate('/app');
    } catch (e) {
      setError('Failed to accept invitation: ' + e.message);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">{error}</h1>
          <button onClick={() => navigate('/login')} className="text-blue-600 underline">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">You've been invited!</h1>
        <p className="text-ink/70 mb-6">
          You've been invited to join as a <strong>{invitation.role}</strong>. 
          {user ? 'Click below to accept the invitation.' : 'Please log in to accept.'}
        </p>
        
        <button
          onClick={acceptInvitation}
          className="w-full bg-ink text-white py-3 rounded-lg font-medium"
        >
          {user ? 'Accept Invitation' : 'Log in to Accept'}
        </button>
      </div>
    </div>
  );
}
```

---

## Implementation Checklist

### Phase 2A: Backend Infrastructure

- [ ] Create Razorpay account and get API keys
- [ ] Create plans in Razorpay dashboard (Starter/Growth/Enterprise - monthly & yearly)
- [ ] Set up webhook endpoint in Razorpay dashboard
- [ ] Create `plans` collection in Firestore with plan details
- [ ] Implement `/api/billing/*` routes in whatsapp-backend
- [ ] Deploy Cloud Functions for webhook handling
- [ ] Deploy Cloud Functions for trial expiration check
- [ ] Deploy Cloud Functions for seat limit enforcement
- [ ] Test webhook flow with Razorpay test mode

### Phase 2B: Frontend Signup Flow

- [ ] Create `BillingContext.jsx` for subscription state
- [ ] Create `useRazorpay.js` hook for checkout
- [ ] Build signup landing page (`/signup`)
- [ ] Build phone verification step (`/signup/auth`)
- [ ] Build organization setup step (`/signup/organization`)
- [ ] Build plan selection step (`/signup/plan`)
- [ ] Build payment step (`/signup/payment`)
- [ ] Build success page (`/signup/success`)
- [ ] Update `AuthContext.jsx` to handle signup flow
- [ ] Update routing to support signup pages

### Phase 2C: Billing Management UI

- [ ] Build billing overview page (`/billing`)
- [ ] Build plan comparison/upgrade page (`/billing/plans`)
- [ ] Build invoice history page (`/billing/history`)
- [ ] Build subscription cancel flow (`/billing/cancel`)
- [ ] Add seat usage banner to Employees page
- [ ] Add trial countdown banner to dashboard
- [ ] Add upgrade modal component

### Phase 2D: Invitation System

- [ ] Create invitation acceptance page (`/invite/:id`)
- [ ] Update admin Employees page to use invitations
- [ ] Add invitation creation function to DataContext
- [ ] Set up email sending for invitations (SendGrid/Mailgun)
- [ ] Set up SMS sending for invitations (Twilio - optional)

### Phase 2E: Security & Testing

- [ ] Update Firestore Security Rules for billing
- [ ] Write Security Rules tests for subscription access
- [ ] Write Security Rules tests for seat limit enforcement
- [ ] Test complete signup flow end-to-end
- [ ] Test webhook handling with various scenarios
- [ ] Test upgrade/downgrade flows
- [ ] Test cancellation and reactivation
- [ ] Test seat limit enforcement

### Phase 2F: Documentation & Launch

- [ ] Update README with billing setup instructions
- [ ] Document environment variables required
- [ ] Create billing FAQ page
- [ ] Set up monitoring/alerting for failed webhooks
- [ ] Set up revenue tracking in analytics
- [ ] Plan launch announcement

---

## Environment Variables Required

```bash
# Frontend (.env)
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxx

# Backend (.env)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx

# Cloud Functions
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx

# Optional (for notifications)
SENDGRID_API_KEY=SG.xxxxxxxx
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Webhook failures | Medium | High | Retry logic, manual reconciliation job, webhook logs monitoring |
| Payment failures | Medium | Medium | Grace period (7 days), dunning emails, auto-downgrade |
| Trial abuse | Medium | Low | Phone verification, limit trial to 1 per phone, fraud detection |
| Seat limit bypass | Low | Medium | Security Rules + Cloud Functions double enforcement |
| Razorpay downtime | Low | High | Grace period for existing customers, status page monitoring |
| Plan migration issues | Low | Medium | Clear migration path, prorated billing, support documentation |

---

## Out of Scope (Future Phases)

The following are explicitly **NOT** part of Phase 2:

- **Multi-currency support** — INR only for now
- **Custom plan negotiation** — Enterprise sales handled separately
- **Usage-based billing** — Fixed per-seat pricing only
- **Refund automation** — Manual refund process via Razorpay dashboard
- **Revenue analytics dashboard** — Basic invoice history only
- **Partner/reseller billing** — Direct billing only
- **Metered features** (SMS, WhatsApp messages) — Unlimited within plan

---

## Success Criteria

Phase 2 is complete when:

1. ✅ User can create a new organization via self-serve signup
2. ✅ 14-day trial is automatically started with no payment required
3. ✅ Razorpay subscription is created when user pays
4. ✅ Webhooks correctly update subscription status in Firestore
5. ✅ Seat limits are enforced (cannot add more users than plan allows)
6. ✅ Trial expiration correctly downgrades organization
7. ✅ Admins can invite new users via invitation link
8. ✅ Users can upgrade/downgrade/cancel subscription
9. ✅ Invoice history is available in the billing section
10. ✅ All Security Rules tests pass

---

**Document End**
