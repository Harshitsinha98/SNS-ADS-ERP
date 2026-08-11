import { Link } from "react-router-dom";
import { Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { useBilling } from "../context/BillingContext";
import { useAuth } from "../context/AuthContext";

// Compact mobile banner — minimal height, essential info only.
export default function TrialBanner() {
  const { isTrialing, isExpired, trialDaysLeft, planName } = useBilling();
  const { user } = useAuth();
  const isAdminish = user?.role === "admin" || user?.role === "owner";

  if (isExpired) {
    return (
      <div className="bg-danger-50 border border-danger-200 rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5">
        <AlertTriangle size={16} className="text-danger-600 shrink-0" />
        <p className="text-xs text-danger-700 flex-1">
          Trial ended. {isAdminish ? "Activate a plan." : "Contact admin."}
        </p>
        {isAdminish && (
          <Link to="/admin/billing" className="text-xs font-bold text-danger-700 whitespace-nowrap press-scale">
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  if (isTrialing) {
    const urgent = trialDaysLeft <= 3;
    return (
      <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5 border ${
        urgent ? "bg-warning-50 border-warning-200" : "bg-orange-50 border-orange-100"
      }`}>
        <Clock size={16} className={urgent ? "text-warning-600" : "text-orange-500"} />
        <p className="text-xs text-ink-soft flex-1">
          <span className="font-bold text-ink">{trialDaysLeft}d</span> left · {planName}
        </p>
        {isAdminish && (
          <Link to="/admin/billing" className="text-xs font-bold text-orange-600 whitespace-nowrap press-scale">
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  return null;
}
