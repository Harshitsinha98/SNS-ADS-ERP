import { createContext, useContext, useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

const BillingContext = createContext();
export const useBilling = () => useContext(BillingContext);

const dayMs = 24 * 60 * 60 * 1000;

export function BillingProvider({ children }) {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.activeOrgId) {
      setOrg(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "organizations", user.activeOrgId),
      (snap) => {
        setOrg(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.warn("Billing listener error:", err?.code || err?.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [user?.activeOrgId]);

  // ---- derived subscription state ----
  const status = org?.subscriptionStatus || "trialing";
  const planName = org?.planName || "Starter";
  const planId = org?.planId || "starter";

  const seatsUsed = org?.seatsUsed ?? 1;
  const seatsLimit = org?.seatsLimit ?? 1;
  const seatsAvailable = Math.max(0, seatsLimit - seatsUsed);
  const canAddSeat = seatsAvailable > 0;

  const leadsUsed = org?.leadsUsed ?? 0;
  const leadsLimit = org?.leadsLimit ?? 0;
  const leadsAvailable = Math.max(0, leadsLimit - leadsUsed);
  const leadLimitReached = leadsLimit > 0 && leadsUsed >= leadsLimit;

  const trialEndsAt = org?.trialEndsAt || null;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / dayMs))
    : 0;

  // Paid-period + subscription lifecycle
  const currentPeriodEndMs = org?.currentPeriodEndMs || 0;
  const billingCycle = org?.billingCycle || "monthly";
  const autopay = org?.autopay === true;
  const pendingPlanChange = org?.pendingPlanChange || null;
  const daysToRenewal = currentPeriodEndMs
    ? Math.ceil((currentPeriodEndMs - Date.now()) / dayMs)
    : null;
  const renewalDue = currentPeriodEndMs && daysToRenewal !== null && daysToRenewal <= 5;

  const isTrialing = status === "trialing";
  const isActive = status === "active";
  const isPastDue = status === "past_due";
  // Trial has run out (client-side view; rules enforce the hard block).
  const trialExpired = isTrialing && trialEndsAt && new Date(trialEndsAt).getTime() < Date.now();
  const isExpired = status === "expired" || trialExpired;

  // Can the org still perform billable actions (add leads / members)?
  const subscriptionActive = isActive || isPastDue || (isTrialing && !trialExpired);

  return (
    <BillingContext.Provider
      value={{
        org,
        loading,
        status,
        planName,
        planId,
        seatsUsed,
        seatsLimit,
        seatsAvailable,
        canAddSeat,
        leadsUsed,
        leadsLimit,
        leadsAvailable,
        leadLimitReached,
        trialEndsAt,
        trialDaysLeft,
        currentPeriodEndMs,
        billingCycle,
        autopay,
        pendingPlanChange,
        daysToRenewal,
        renewalDue,
        isTrialing,
        isActive,
        isPastDue,
        isExpired,
        trialExpired,
        subscriptionActive,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
}
