import { createContext, useContext, useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

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
        const userSnap = await getDoc(doc(db, "users", uid));
        
        // Step 2: Get user's active memberships
        const membershipsQuery = query(
          collection(db, "memberships"),
          where("uid", "==", uid),
          where("active", "==", true)
        );
        const membershipsSnap = await getDocs(membershipsQuery);

        if (membershipsSnap.empty) {
          // No organization membership - allow access to Setup page
          console.log("No organization membership found for user:", uid, "- redirecting to setup");
          
          // Create minimal user object for setup
          const userData = {
            uid: uid,
            phone: phone,
            displayName: null,
            needsSetup: true, // Flag to indicate setup is needed
          };
          userData.id = uid;
          
          setUser(userData);
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
        const orgSnap = await getDoc(doc(db, "organizations", activeMembership.orgId));

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

        setUser(userData);

      } catch (e) {
        console.error("User profile fetch error:", e);
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

  // Step 1: Check if user exists (by phone) - check memberships collection
  const requestOtp = async (phone) => {
    const phoneId = toE164(phone);
    
    try {
      // For Phase 1, we need to check if a user with this phone exists
      // After migration, user documents are keyed by UID, so we need to:
      // 1. Check all users collection for this phone number
      // 2. Or query memberships by phone (if we add phone field there)
      // For now, let's check the new users collection structure
      
      // Note: This query requires a composite index in production
      // For now, we'll proceed with OTP and validate membership after auth
      // This is a security consideration for Phase 1
      
    } catch (e) {
      console.error("Registration check error:", e);
      return { ok: false, error: "Number check karne mein error aaya. Thodi der baad try karo." };
    }
    
    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phoneId, verifier);
      return { ok: true, confirmation };
    } catch (e) {
      console.error(e);
      return { ok: false, error: "OTP bhejne mein error aaya. Recaptcha ya billing check karo." };
    }
  };

  // Step 2: OTP verify
  const verifyOtp = async (confirmation, otp) => {
    try {
      await confirmation.confirm(otp);
      return { ok: true };
    } catch {
      return { ok: false, error: "Galat ya expired OTP." };
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
