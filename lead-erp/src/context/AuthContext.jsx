import { createContext, useContext, useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { withTimeout } from "../utils/withTimeout";
import { claimTeamInvites } from "../utils/billingApi";
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
        // Step 1: Get user's global profile (users/{uid})
        const userSnap = await withTimeout(getDoc(doc(db, "users", uid)), 15000, "load profile");
        
        const isPlatformOwner = phone === PLATFORM_OWNER_PHONE;

        // Pending invites are claimed by a backend transaction on every sign-in.
        // This supports users who belong to multiple organizations without ever
        // allowing a browser to create or elevate a membership.
        await claimTeamInvites().catch((error) => {
          console.warn("Invite claim skipped:", error?.message || error);
        });

        // Step 2: Get user's active memberships
        const membershipsQuery = query(
          collection(db, "memberships"),
          where("uid", "==", uid),
          where("active", "==", true)
        );
        let membershipsSnap = await withTimeout(getDocs(membershipsQuery), 15000, "load memberships");

        if (membershipsSnap.empty) {
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
        
        for (const m of membershipsSnap.docs) {
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

  // Step 1: Send OTP to phone
  const requestOtp = async (phone) => {
    const phoneId = toE164(phone);

    // Guard: make sure Firebase config actually loaded (.env missing = no apiKey)
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      return {
        ok: false,
        error: "Firebase config missing. Create a .env file (VITE_FIREBASE_* keys) and restart the app.",
      };
    }

    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phoneId, verifier);
      return { ok: true, confirmation };
    } catch (e) {
      console.error("requestOtp error:", e.code, e.message);
      // reset so the user can retry without a stale captcha
      resetRecaptcha();
      return { ok: false, error: otpErrorMessage(e.code) };
    }
  };

  // Step 2: OTP verify
  const verifyOtp = async (confirmation, otp) => {
    if (!confirmation) {
      return { ok: false, error: "Session expired. Please request a new OTP." };
    }
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
