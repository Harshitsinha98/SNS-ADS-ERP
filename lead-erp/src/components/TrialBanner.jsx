import { Link } from "react-router-dom";
import { Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { useBilling } from "../context/BillingContext";
import { useAuth } from "../context/AuthContext";

// Slim banner shown across the app while an org is on trial or expired.
// Only admins/owners get the upgrade CTA (they can change the plan).
export default function TrialBanner() {
  const { isTrialing, isExpired, trialDaysLeft, planName } = useBilling();
  const { user } = useAuth();
  const isAdminish = user?.role === "admin" || user?.role === "owner";

  if (isExpired) {
    return (
      <div className="bg-danger-50 border border-danger-200 rounded-xl px-4 py-3 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <AlertTriangle size={18} className="text-danger-600 mt-0.5 shrink-0" />
          <p className="text-sm text-danger-700">
            Aapka trial/subscription khatam ho gaya hai. Naye leads aur team members add karne ke liye plan activate karo.
          </p>
        </div>
        {isAdminish && (
          <Link to="/admin/billing" className="btn btn-primary text-sm whitespace-nowrap">
            Upgrade now <ArrowRight size={15} />
          </Link>
        )}
      </div>
    );
  }

  if (isTrialing) {
    const urgent = trialDaysLeft <= 3;
    return (
      <div className={`rounded-xl px-4 py-3 mb-5 flex flex-col sm:flex-row sm:items-center gap-3 border ${
        urgent ? "bg-warning-50 border-warning-200" : "bg-orange-50 border-orange-200"
      }`}>
        <div className="flex items-center gap-2.5 flex-1">
          <Clock size={18} className={urgent ? "text-warning-600" : "text-orange-600"} />
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{trialDaysLeft} din</span> ka free trial bacha hai
            <span className="text-ink-muted"> · {planName} plan</span>
          </p>
        </div>
        {isAdminish && (
          <Link to="/admin/billing" className="text-sm font-semibold text-orange-600 hover:underline whitespace-nowrap">
            Upgrade / manage plan →
          </Link>
        )}
      </div>
    );
  }

  return null;
}
