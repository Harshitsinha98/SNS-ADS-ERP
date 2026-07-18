import { createContext, useContext, useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { withTimeout } from "../utils/withTimeout";
import { PLATFORM_OWNER_PHONE } from "../data/constants";

// When an invited employee logs in, turn their pending invite(s) into real
// UID-keyed membership(s) so their login resolves to the employee dashboard
// instead of the "create organization" prompt.
async function claimPendingInvites(uid, phone) {
  if (!phone) return 0;
  let claimed = 0;
  try {
    const invSnap = await getDocs(
      query(collection(db, "invites"), where("phone", "==", phone), where("active", "==", true))
    );
    for (const inv of invSnap.docs) {
      const d = inv.data();
      try {
        await setDoc(doc(db, "memberships", `${uid}_${d.orgId}`), {
          uid,
          orgId: d.orgId,
          role: d.role || "employee",
          displayName: d.displayName || "Member",
          email: d.email || "",
          phone: phone, // E164 — for team display & dedup
          active: true,
          invitedBy: d.invitedBy || null,
          joinedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        });
        await updateDoc(inv.ref, {
          active: false,
          claimed: true,
          claimedByUid: uid,
          claimedAt: new Date().toISOString(),
        });
        await setDoc(
          doc(db, "users", uid),
          { phone, displayName: d.displayName || "Member", defaultOrgId: d.orgId, lastLoginAt: new Date().toISOString() },
          { merge: true }
        );
        claimed++;
      } catch (e) {
        console.error("Invite claim failed for org", d.orgId, e?.code, e?.message);
      }
    }
  } catch (e) {
    console.warn("Invite lookup skipped:", e?.code || e?.message);
  }
  return claimed;
}

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

        // Step 2: Get user's active memberships
        const membershipsQuery = query(
          collection(db, "memberships"),
          where("uid", "==", uid),
          where("active", "==", true)
        );
        let membershipsSnap = await withTimeout(getDocs(membershipsQuery), 15000, "load memberships");

        // Step 2b: If none, this might be an invited employee logging in for the
        // first time — claim their pending invite(s) into real memberships.
        if (membershipsSnap.empty) {
          const claimed = await claimPendingInvites(uid, phone);
          if (claimed > 0) {
            membershipsSnap = await withTimeout(getDocs(membershipsQuery), 15000, "reload memberships");
          }
        }

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
        const userData = {
          uid: uid,
          phone: phone,
          displayName: userSnap.exists() ? userSnap.data().displayName : null,
          
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
        return "Phone number galat hai. 10-digit sahi number daalo.";
      case "auth/missing-phone-number":
        return "Phone number missing hai.";
      case "auth/quota-exceeded":
        return "Aaj ka OTP quota khatam. Kal try karo ya Firebase billing enable karo.";
      case "auth/too-many-requests":
        return "Bahut zyada attempts. Thodi der baad try karo.";
      case "auth/captcha-check-failed":
        return "reCAPTCHA verify nahi hua. Domain authorize karo aur dobara try karo.";
      case "auth/invalid-app-credential":
        return "reCAPTCHA/App credential invalid. Firebase config aur authorized domains check karo.";
      case "auth/operation-not-allowed":
        return "Phone sign-in enable nahi hai. Firebase Console → Authentication → Sign-in method → Phone enable karo.";
      case "auth/billing-not-enabled":
        return "Firebase billing enable nahi hai (Phone Auth ke liye zaroori).";
      default:
        return `OTP bhejne mein error: ${code || "unknown"}. Console check karo.`;
    }
  };

  // Step 1: Send OTP to phone
  const requestOtp = async (phone) => {
    const phoneId = toE164(phone);

    // Guard: make sure Firebase config actually loaded (.env missing = no apiKey)
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      return {
        ok: false,
        error: "Firebase config missing hai. .env file banao (VITE_FIREBASE_* keys) aur app restart karo.",
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
      return { ok: false, error: "Session expired. Phir se OTP bhejo." };
    }
    try {
      await confirmation.confirm(otp);
      return { ok: true };
    } catch (e) {
      console.error("verifyOtp error:", e.code, e.message);
      if (e.code === "auth/invalid-verification-code") {
        return { ok: false, error: "Galat OTP. Dobara check karo." };
      }
      if (e.code === "auth/code-expired") {
        return { ok: false, error: "OTP expire ho gaya. Naya OTP bhejo." };
      }
      return { ok: false, error: "OTP verify nahi hua. Dobara try karo." };
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
