import { createContext, useContext, useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { withTimeout } from "../utils/withTimeout";
import { claimTeamInvites } from "../utils/billingApi";
import { getOtpConfig, sendOtpRequest, verifyOtpRequest } from "../utils/otpApi";
import { PLATFORM_OWNER_PHONE } from "../data/constants";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const toE164 = (phone) => "+91" + phone.replace(/\D/g, "").slice(-10);

const STORAGE_KEY_ACTIVE_ORG = "activeOrgId";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { 
        setUser(null); 
        setAuthLoading(false); 
        return; 
      }

      const uid = fbUser.uid;
      const phone = fbUser.phoneNumber;

      try {
        // OPTIMIZATION: Parallelize independent reads on login.
        // Before: Sequential reads (userProfile → claimInvites → memberships → org)
        //   Total latency: ~4 round-trips × 100-300ms = 400-1200ms
        // After: Parallel reads (userProfile + memberships in parallel, then org)
        //   Total latency: ~2 round-trips × 100-300ms = 200-600ms
        // COST SAVINGS: Same number of reads but 50% latency reduction on login.
        
        const isPlatformOwner = phone === PLATFORM_OWNER_PHONE;

        // Step 1: Fire user profile + memberships + invite claim in PARALLEL
        const membershipsQuery = query(
          collection(db, "memberships"),
          where("uid", "==", uid),
          where("active", "==", true)
        );
        const [userSnap, membershipsSnap] = await Promise.all([
          withTimeout(getDoc(doc(db, "users", uid)), 15000, "load profile"),
          withTimeout(getDocs(membershipsQuery), 15000, "load memberships"),
        ]);

        // Claim invites fires in background — don't block login on it
        claimTeamInvites().catch((error) => {
          console.warn("Invite claim skipped:", error?.message || error);
        });

        const activeMembershipDocs = membershipsSnap.docs.filter((membership) => {
          const expiresAtMs = Number(membership.data().expiresAtMs || 0);
          return !expiresAtMs || expiresAtMs > Date.now();
        });

        if (activeMembershipDocs.length === 0) {
          // Platform owner has no org membership but still needs the /platform
          // dashboard — don't force org setup on them.
          if (isPlatformOwner) {
            setUser({ uid, id: uid, phone, displayName: null, isPlatformOwner: true });
            setAuthLoading(false);
            return;
          }
          console.log("No organization membership found for user:", uid, "- redirecting to setup");
          setUser({ uid, id: uid, phone, displayName: null, needsSetup: true });
          setAuthLoading(false);
          return;
        }

        // Step 3: Build membership list
        const memberships = [];
        const orgIds = [];
        
        for (const m of activeMembershipDocs) {
          const mData = m.data();
          memberships.push({
            orgId: mData.orgId,
            role: mData.role,
            displayName: mData.displayName,
            membershipId: m.id,
          });
          orgIds.push(mData.orgId);
        }

        // Step 4: Determine active org (from localStorage or first membership)
        let activeOrgId = localStorage.getItem(STORAGE_KEY_ACTIVE_ORG);
        
        if (!activeOrgId || !orgIds.includes(activeOrgId)) {
          // Use default org from user profile, or first available
          activeOrgId = userSnap.exists() 
            ? (userSnap.data().defaultOrgId || memberships[0].orgId)
            : memberships[0].orgId;
          localStorage.setItem(STORAGE_KEY_ACTIVE_ORG, activeOrgId);
        }

        // Step 5: Get active org details
        const activeMembership = memberships.find(m => m.orgId === activeOrgId) || memberships[0];
        const orgSnap = await withTimeout(
          getDoc(doc(db, "organizations", activeMembership.orgId)),
          15000,
          "load organization"
        );

        // Step 6: Build user object with org context
        const displayName = userSnap.exists()
          ? (userSnap.data().displayName || activeMembership.displayName || phone || "there")
          : (activeMembership.displayName || phone || "there");
        const userData = {
          uid: uid,
          phone: phone,
          displayName,
          // `name` is retained for legacy employee/admin components.
          name: displayName,
          
          // Active organization context
          activeOrgId: activeMembership.orgId,
          activeOrgRole: activeMembership.role,
          activeOrgName: orgSnap.exists() ? orgSnap.data().name : "Unknown Org",
          
          // All memberships for org switcher
          memberships: memberships,
        };

        // Legacy compatibility: id field maps to uid
        userData.id = uid;
        // Map role for backward compatibility with existing DataContext
        userData.role = activeMembership.role;
        // Platform owner flag (for /platform access + redirect)
        userData.isPlatformOwner = isPlatformOwner;

        setUser(userData);

      } catch (e) {
        console.error("User profile fetch error:", e?.code, e?.message);
        if (e?.code === "deadline-exceeded") {
          console.error("Firestore is unreachable — check that Firestore Database is created & rules are published.");
        }
        await signOut(auth);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    });

    return unsub;
  }, []);

  // Switch active organization
  const switchOrg = async (orgId) => {
    if (!user || !user.memberships.find(m => m.orgId === orgId)) {
      console.error("Cannot switch to org - not a member:", orgId);
      return false;
    }

    const membership = user.memberships.find(m => m.orgId === orgId);
    const orgSnap = await getDoc(doc(db, "organizations", orgId));

    const updatedUser = {
      ...user,
      activeOrgId: orgId,
      activeOrgRole: membership.role,
      activeOrgName: orgSnap.exists() ? orgSnap.data().name : "Unknown Org",
      role: membership.role, // Update legacy role field
    };

    setUser(updatedUser);
    localStorage.setItem(STORAGE_KEY_ACTIVE_ORG, orgId);
    return true;
  };

  const ensureRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
    return window.recaptchaVerifier;
  };

  // Clear a stale/expired reCAPTCHA so the next attempt starts fresh
  const resetRecaptcha = () => {
    try {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
      }
    } catch (e) {
      console.warn("Recaptcha clear failed:", e);
    }
    window.recaptchaVerifier = null;
  };

  // Map Firebase auth error codes -> readable messages
  const otpErrorMessage = (code) => {
    switch (code) {
      case "auth/invalid-phone-number":
        return "Invalid phone number. Please enter a valid 10-digit number.";
      case "auth/missing-phone-number":
        return "Phone number is missing.";
      case "auth/quota-exceeded":
        return "Today's OTP quota is exhausted. Try again tomorrow or enable Firebase billing.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again after a while.";
      case "auth/captcha-check-failed":
        return "reCAPTCHA verification failed. Authorize the domain and try again.";
      case "auth/invalid-app-credential":
        return "Invalid reCAPTCHA/app credential. Check your Firebase config and authorized domains.";
      case "auth/operation-not-allowed":
        return "Phone sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method → Phone.";
      case "auth/billing-not-enabled":
        return "Firebase billing is not enabled (required for Phone Auth).";
      default:
        return `Error sending OTP: ${code || "unknown"}. Please check the console.`;
    }
  };

  // ── Step 1: Send OTP ────────────────────────────────────────────────
  // Prefers the multi-channel backend (WhatsApp → SMS → Voice) when it is
  // configured; otherwise transparently falls back to Firebase Phone Auth.
  // Returns `{ ok, mode, confirmation?, channel?, devCode?, error? }`.
  // `via` lets the caller request a specific delivery channel for the
  // "didn't receive it?" fallbacks:
  //   - "whatsapp" | "voice"  → force that channel on the multi-channel backend
  //   - "sms_firebase"        → use Firebase Phone Auth (SMS) directly
  //   - null/undefined        → default fallback chain (WhatsApp first)
  const requestOtp = async (phone, via = null) => {
    // Frontend kill-switch: set VITE_OTP_FORCE_FIREBASE=true to bypass the
    // MSG91 multi-channel backend entirely and use Firebase Phone Auth. Useful
    // while the WhatsApp authentication template is pending Meta approval (or
    // SMS DLT isn't registered), so login keeps working without touching the
    // backend deployment. Remove it to restore the normal multi-channel flow.
    const forceFirebase =
      String(import.meta.env.VITE_OTP_FORCE_FIREBASE || "").toLowerCase() === "true";
    const useFirebaseSms = via === "sms_firebase";

    // Try multi-channel OTP first — unless forced/asked to use Firebase.
    if (!forceFirebase && !useFirebaseSms) {
      try {
        const cfg = await getOtpConfig();
        if (cfg?.enabled) {
          const channel = ["whatsapp", "sms", "voice"].includes(via) ? via : undefined;
          const r = await sendOtpRequest(phone, channel);
          if (r.ok) return { ok: true, mode: "multi", channel: r.channel, devCode: r.devCode };
          return { ok: false, mode: "multi", error: r.error, retryAfter: r.retryAfter };
        }
      } catch (e) {
        console.warn("Multi-channel OTP unavailable, falling back to Firebase:", e?.message);
      }
    }

    // Firebase Phone Auth (SMS via reCAPTCHA) — default fallback or explicit SMS.
    const phoneId = toE164(phone);
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      return {
        ok: false,
        error: "Firebase config missing. Create a .env file (VITE_FIREBASE_* keys) and restart the app.",
      };
    }
    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phoneId, verifier);
      return { ok: true, mode: "firebase", channel: "sms", confirmation };
    } catch (e) {
      console.error("requestOtp error:", e.code, e.message);
      resetRecaptcha();
      return { ok: false, error: otpErrorMessage(e.code) };
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────────────
  // Backward compatible: existing callers pass (confirmation, otp). For the
  // multi-channel flow there is no confirmation object, so callers pass the
  // phone number as the third argument and we verify server-side, then sign in
  // with the returned Firebase custom token.
  const verifyOtp = async (confirmation, otp, phone) => {
    // Multi-channel path (no Firebase confirmation object).
    if (!confirmation) {
      if (!phone) {
        return { ok: false, error: "Session expired. Please request a new code." };
      }
      const r = await verifyOtpRequest(phone, otp);
      if (!r.ok) return { ok: false, error: r.error };
      try {
        await signInWithCustomToken(auth, r.token);
        return { ok: true };
      } catch (e) {
        console.error("signInWithCustomToken error:", e.code, e.message);
        return { ok: false, error: "Could not complete sign in. Please try again." };
      }
    }

    // Firebase Phone Auth path.
    try {
      await confirmation.confirm(otp);
      return { ok: true };
    } catch (e) {
      console.error("verifyOtp error:", e.code, e.message);
      if (e.code === "auth/invalid-verification-code") {
        return { ok: false, error: "Incorrect OTP. Please check and try again." };
      }
      if (e.code === "auth/code-expired") {
        return { ok: false, error: "OTP expired. Please request a new one." };
      }
      return { ok: false, error: "OTP verification failed. Please try again." };
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ORG);
    signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      authLoading, 
      requestOtp, 
      verifyOtp, 
      logout,
      switchOrg 
    }}>
      {children}
    </AuthContext.Provider>
  );
}
