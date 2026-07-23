import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/marketing/Landing";
import Pricing from "./pages/marketing/Pricing";
import Signup from "./pages/marketing/Signup";
import Privacy from "./pages/marketing/Privacy";
import Terms from "./pages/marketing/Terms";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import AdminDashboard from "./pages/admin/Dashboard";
import LeadHub from "./pages/admin/LeadHub";
import LeadDetail from "./pages/admin/LeadDetail";
import Employees from "./pages/admin/Employees";
import EmployeeDetail from "./pages/admin/EmployeeDetail";
import Settings from "./pages/admin/Settings";
import Billing from "./pages/admin/Billing";
import WhatsApp from "./pages/admin/WhatsApp";
import WebsiteLeadIntegration from "./pages/admin/WebsiteLeadIntegration";
import WebsiteLeadForm from "./pages/public/WebsiteLeadForm";
import FollowUpQueue from "./pages/admin/FollowUpQueue";
import Automation from "./pages/admin/Automation";
import Workflows from "./pages/admin/Workflows";
import WorkflowBuilder from "./pages/admin/WorkflowBuilder";
import AdLeadIntegrations from "./pages/admin/AdLeadIntegrations";
import AICustomerCare from "./pages/admin/AICustomerCare";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import ExecutiveDashboard from "./pages/platform/ExecutiveDashboard";
import OrganizationsPage from "./pages/platform/OrganizationsPage";
import BillingPage from "./pages/platform/BillingPage";
import CustomerSuccessPage from "./pages/platform/CustomerSuccessPage";
import AnalyticsPage from "./pages/platform/AnalyticsPage";
import InfrastructurePage from "./pages/platform/InfrastructurePage";
import WhatsAppOpsPage from "./pages/platform/WhatsAppOpsPage";
import AiUsagePage from "./pages/platform/AiUsagePage";
import AuditLogsPage from "./pages/platform/AuditLogsPage";
import FeatureFlagsPage from "./pages/platform/FeatureFlagsPage";
import SettingsPage from "./pages/platform/SettingsPage";
import SupportPage from "./pages/platform/SupportPage";
import Workspace from "./pages/employee/Workspace";
import LeadAction from "./pages/employee/LeadAction";
import Tasks from "./pages/employee/Tasks";

// 1. 📲 Imported the native Android Call Tracker hook
import { useCallTracker } from "./hooks/useCallTracker";

// 2. 🤫 Background engine component (listens to the dialer in the background without rendering any UI)
function CallTrackerEngine() {
  useCallTracker();
  return null;
}

export default function App() {
  return (
    <>
      {/* 🔥 The real magic: mount the background call-tracker watchman */}
      <CallTrackerEngine />

      <Routes>
        {/* --- PUBLIC MARKETING --- */}
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/website-lead-form/:orgId/:token" element={<WebsiteLeadForm />} />

        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />

        {/* --- ADMIN SECTION --- */}
        <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/leads" element={<ProtectedRoute role="admin"><LeadHub /></ProtectedRoute>} />
        <Route path="/admin/leads/:id" element={<ProtectedRoute role="admin"><LeadDetail /></ProtectedRoute>} />
        <Route path="/admin/employees" element={<ProtectedRoute role="admin"><Employees /></ProtectedRoute>} />
        <Route path="/admin/employees/:id" element={<ProtectedRoute role="admin"><EmployeeDetail /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute role="admin"><Settings /></ProtectedRoute>} />
        <Route path="/admin/billing" element={<ProtectedRoute role="admin"><Billing /></ProtectedRoute>} />
        <Route path="/admin/whatsapp" element={<ProtectedRoute role="admin"><WhatsApp /></ProtectedRoute>} />
        <Route path="/admin/website-lead-integration" element={<ProtectedRoute role="admin"><WebsiteLeadIntegration /></ProtectedRoute>} />
        <Route path="/admin/follow-ups" element={<ProtectedRoute role="admin"><FollowUpQueue /></ProtectedRoute>} />
        <Route path="/admin/automation" element={<ProtectedRoute role="admin"><Automation /></ProtectedRoute>} />
        <Route path="/admin/workflows" element={<ProtectedRoute role="admin"><Workflows /></ProtectedRoute>} />
        <Route path="/admin/workflows/:workflowId" element={<ProtectedRoute role="admin"><WorkflowBuilder /></ProtectedRoute>} />
        <Route path="/admin/ad-leads" element={<ProtectedRoute role="admin"><AdLeadIntegrations /></ProtectedRoute>} />
        <Route path="/admin/ai-customer-care" element={<ProtectedRoute role="admin"><AICustomerCare /></ProtectedRoute>} />

        {/* --- PLATFORM OWNER CONSOLE (self-contained auth inside each page;
                only +919653043939 can enter). Accessible at /platform/*. --- */}
        <Route path="/platform" element={<ExecutiveDashboard />} />
        <Route path="/platform/organizations" element={<OrganizationsPage />} />
        <Route path="/platform/organizations/:orgId" element={<OrganizationsPage />} />
        <Route path="/platform/billing" element={<BillingPage />} />
        <Route path="/platform/customer-success" element={<CustomerSuccessPage />} />
        <Route path="/platform/analytics" element={<AnalyticsPage />} />
        <Route path="/platform/infrastructure" element={<InfrastructurePage />} />
        <Route path="/platform/whatsapp" element={<WhatsAppOpsPage />} />
        <Route path="/platform/ai-usage" element={<AiUsagePage />} />
        <Route path="/platform/audit-logs" element={<AuditLogsPage />} />
        <Route path="/platform/feature-flags" element={<FeatureFlagsPage />} />
        <Route path="/platform/settings" element={<SettingsPage />} />
        <Route path="/platform/support" element={<SupportPage />} />
        {/* Legacy /owner route → redirect to new console */}
        <Route path="/owner" element={<PlatformDashboard />} />

        {/* --- EMPLOYEE SECTION --- */}
        <Route path="/app" element={<ProtectedRoute role="employee"><Workspace /></ProtectedRoute>} />
        <Route path="/app/lead/:id" element={<ProtectedRoute role="employee"><LeadAction /></ProtectedRoute>} />
        <Route path="/app/tasks" element={<ProtectedRoute role="employee"><Tasks /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}