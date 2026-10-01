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
          <Link to="/admin/billing" className="inline-flex items-center gap-1 text-xs font-bold text-white bg-danger-600 hover:bg-danger-700 px-2.5 py-1.5 rounded-lg whitespace-nowrap press-scale transition-colors">
            Upgrade <ArrowRight size={12} />
          </Link>
        )}
      </div>
    );
  }

  if (isTrialing) {
    const urgent = trialDaysLeft <= 3;
    return (
      <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2.5 border ${
        urgent ? "bg-gradient-to-r from-warning-50 to-white border-warning-200" : "bg-gradient-to-r from-orange-50 to-white border-orange-100"
      }`}>
        <Clock size={16} className={urgent ? "text-warning-600" : "text-orange-500"} />
        <p className="text-xs text-ink-soft flex-1">
          <span className="font-bold text-ink">{trialDaysLeft}d</span> left · {planName}
        </p>
        {isAdminish && (
          <Link to="/admin/billing" className="inline-flex items-center gap-1 text-xs font-bold text-white bg-gradient-orange shadow-button hover:shadow-button-hover px-2.5 py-1.5 rounded-lg whitespace-nowrap press-scale transition-shadow">
            Upgrade <ArrowRight size={12} />
          </Link>
        )}
      </div>
    );
  }

  return null;
}
