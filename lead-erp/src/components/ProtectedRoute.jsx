import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { user, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // If user needs setup, redirect to setup page (unless already there)
  if (user.needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  // If user is on setup but doesn't need it, redirect to dashboard
  if (!user.needsSetup && location.pathname === '/setup') {
    return <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
  }

  // Role-based access
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
  }

  return children;
}
