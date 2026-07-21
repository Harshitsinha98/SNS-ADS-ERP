/**
 * Platform auth hook — reusable check for platform admin status.
 *
 * Mirrors the existing PlatformDashboard.jsx logic but extracted into a
 * reusable hook so all 12 platform modules share one auth source of truth.
 */

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useAuth } from "../../../context/AuthContext";
import { PLATFORM_OWNER_PHONE } from "../../../data/constants";

export function usePlatformAuth() {
  const { user, authLoading } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setIsPlatformAdmin(false);
      setChecking(false);
      return;
    }

    // Hardcoded owner phone always qualifies (matches firestore.rules)
    if (user.isPlatformOwner || user.phone === PLATFORM_OWNER_PHONE) {
      setIsPlatformAdmin(true);
      setChecking(false);
      return;
    }

    // Check platformAdmins collection for additional admins
    getDoc(doc(db, "platformAdmins", user.uid))
      .then((snap) => setIsPlatformAdmin(snap.exists()))
      .catch(() => setIsPlatformAdmin(false))
      .finally(() => setChecking(false));
  }, [user, authLoading]);

  return { isPlatformAdmin, checking, user };
}
