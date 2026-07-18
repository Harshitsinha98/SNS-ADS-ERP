import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/marketing/Landing";
import Pricing from "./pages/marketing/Pricing";
import Signup from "./pages/marketing/Signup";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import AdminDashboard from "./pages/admin/Dashboard";
import LeadHub from "./pages/admin/LeadHub";
import LeadDetail from "./pages/admin/LeadDetail";
import Employees from "./pages/admin/Employees";
import EmployeeDetail from "./pages/admin/EmployeeDetail";
import Settings from "./pages/admin/Settings";
import Workspace from "./pages/employee/Workspace";
import LeadAction from "./pages/employee/LeadAction";
import Tasks from "./pages/employee/Tasks";

// 1. 📲 Native Android Call Tracker Hook import kiya
import { useCallTracker } from "./hooks/useCallTracker";

// 2. 🤫 Background Engine Component (Bina koi UI banaye pichhe se dialer sunega)
function CallTrackerEngine() {
  useCallTracker();
  return null;
}

export default function App() {
  return (
    <>
      {/* 🔥 Asli jadoo: Pandal ke andar Watchman ko duty par bitha diya */}
      <CallTrackerEngine />

      <Routes>
        {/* --- PUBLIC MARKETING --- */}
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />

        {/* --- ADMIN SECTION --- */}
        <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/leads" element={<ProtectedRoute role="admin"><LeadHub /></ProtectedRoute>} />
        <Route path="/admin/leads/:id" element={<ProtectedRoute role="admin"><LeadDetail /></ProtectedRoute>} />
        <Route path="/admin/employees" element={<ProtectedRoute role="admin"><Employees /></ProtectedRoute>} />
        <Route path="/admin/employees/:id" element={<ProtectedRoute role="admin"><EmployeeDetail /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute role="admin"><Settings /></ProtectedRoute>} />

        {/* --- EMPLOYEE SECTION --- */}
        <Route path="/app" element={<ProtectedRoute role="employee"><Workspace /></ProtectedRoute>} />
        <Route path="/app/lead/:id" element={<ProtectedRoute role="employee"><LeadAction /></ProtectedRoute>} />
        <Route path="/app/tasks" element={<ProtectedRoute role="employee"><Tasks /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}