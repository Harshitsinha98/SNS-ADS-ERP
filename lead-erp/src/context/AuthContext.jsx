import { createContext, useContext, useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const toE164 = (phone) => "+91" + phone.replace(/\D/g, "").slice(-10);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setUser(null); setAuthLoading(false); return; }
      // Firebase ne phone ownership verify kar diya — ab apna users collection check karo
      const phoneId = fbUser.phoneNumber; // already "+91XXXXXXXXXX" format
      const snap = await getDoc(doc(db, "users", phoneId));
      if (!snap.exists() || snap.data().active === false) {
        // Number Firebase mein verify ho gaya par humare ERP mein registered nahi hai
        await signOut(auth);
        setUser(null);
        setAuthLoading(false);
        return;
      }
      setUser({ id: phoneId, phone: phoneId.replace("+91", ""), ...snap.data() });
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const ensureRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
    return window.recaptchaVerifier;
  };

  // Step 1: registered check + Firebase real OTP bhejo
  const requestOtp = async (phone) => {
    const phoneId = toE164(phone);
    const snap = await getDoc(doc(db, "users", phoneId));
    if (!snap.exists() || snap.data().active === false) {
      return { ok: false, error: "Ye number registered nahi hai. Admin se contact karo." };
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

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, authLoading, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}