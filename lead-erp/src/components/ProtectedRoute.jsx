import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { user, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-muted text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // owner is treated as admin for route access
  const isAdminish = user.role === "admin" || user.role === "owner";
  const home = isAdminish ? "/admin" : "/app";

  // If user needs setup, redirect to setup page (unless already there)
  if (user.needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  // If user is on setup but doesn't need it, redirect to dashboard
  if (!user.needsSetup && location.pathname === "/setup") {
    return <Navigate to={home} replace />;
  }

  // Role-based access — owner satisfies an "admin" requirement
  if (role) {
    const roleOk = user.role === role || (role === "admin" && user.role === "owner");
    if (!roleOk) return <Navigate to={home} replace />;
  }

  return children;
}
