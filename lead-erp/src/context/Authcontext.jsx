import { createContext, useContext, useState, useEffect } from "react";
import { BACKEND_URL } from "../utils/config";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem("erp_user");
    return s ? JSON.parse(s) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem("erp_user", JSON.stringify(user));
    else localStorage.removeItem("erp_user");
  }, [user]);

  // Step 1: phone registered hai ya nahi check + OTP request
  const requestOtp = async (phone, allUsers) => {
    const found = allUsers.find((u) => u.phone === phone && u.active !== false);
    if (!found) return { ok: false, error: "Ye number registered nahi hai. Admin se contact karo." };

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!data.success) return { ok: false, error: data.error || "OTP bhejne mein error aaya" };
      return { ok: true, devOtp: data.devOtp, matchedUser: found };
    } catch {
      return { ok: false, error: "Backend se connect nahi ho paaya. Backend chal raha hai check karo." };
    }
  };

  // Step 2: OTP verify + login
  const verifyOtp = async (phone, otp, matchedUser) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!data.success) return { ok: false, error: data.error || "Invalid OTP" };
      setUser(matchedUser);
      return { ok: true, role: matchedUser.role };
    } catch {
      return { ok: false, error: "Backend se connect nahi ho paaya." };
    }
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}