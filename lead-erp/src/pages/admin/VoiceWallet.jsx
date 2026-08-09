import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { useBilling } from "../../context/BillingContext";
import { useAuth } from "../../context/AuthContext";
import {
  getWalletBalance,
  getWalletTransactions,
  createWalletOrder,
  verifyWalletPayment,
  loadRazorpayScript,
} from "../../utils/billingApi";
import {
  Wallet, Plus, Clock, ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw,
  IndianRupee, CheckCircle2, AlertCircle, Sparkles, TrendingUp, Zap, Lock, ArrowRight,
} from "lucide-react";

const PRESETS = [500, 1000, 2000, 5000];
const MIN_TOPUP = 100;
const BRIDGE_RATE = 2.20; // ₹/min bridge call
const AI_RATE = 5;        // ₹/min AI voice call

const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

// Voice Wallet is a Growth+ feature.
const WALLET_PLANS = new Set(["growth", "enterprise", "enterprise_plus"]);
// AI voice calling is a Scale (enterprise) & above feature.
const AI_VOICE_PLANS = new Set(["enterprise", "enterprise_plus"]);

export default function VoiceWallet() {
  const b = useBilling();
  const { org } = b;
  const { user } = useAuth();
  const navigate = useNavigate();

  const planId = b.planId || "starter";
  const walletLocked = !WALLET_PLANS.has(planId);
  const aiVoiceEnabled = AI_VOICE_PLANS.has(planId);

  const [balance, setBalance] = useState({ balanceInr: 0, totalSpentInr: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingTxns, setLoadingTxns] = useState(true);
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const orgId = org?.id;

  const fetchBalance = useCallback(async () => {
    if (!orgId) return;
    setLoadingBalance(true);
    try {
      const data = await getWalletBalance(orgId);
      setBalance({
        balanceInr: data.balanceInr ?? 0,
        totalSpentInr: data.totalSpentInr ?? 0,
      });
    } catch (e) {
      console.warn("Wallet balance fetch:", e.message);
    } finally {
      setLoadingBalance(false);
    }
  }, [orgId]);

  const fetchTransactions = useCallback(async () => {
    if (!orgId) return;
    setLoadingTxns(true);
    try {
      const data = await getWalletTransactions(orgId);
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (e) {
      console.warn("Wallet transactions fetch:", e.message);
      setTransactions([]);
    } finally {
      setLoadingTxns(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const handleTopUp = async () => {
    const amt = Math.round(Number(amount));
    if (!amt || amt < MIN_TOPUP) {
      setMsg({ type: "error", text: `Minimum top-up is ₹${MIN_TOPUP}.` });
      return;
    }
    setMsg({ type: "", text: "" });
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Razorpay checkout failed to load. Please try again.");

      const order = await createWalletOrder({ orgId, amountInr: amt });

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          order_id: order.orderId,
          name: "Codeskate CRM",
          description: `Voice Wallet top-up (₹${amt})`,
          prefill: {
            name: user?.displayName || "",
            contact: (user?.phone || "").replace("+91", ""),
          },
          theme: { color: "#F04E00" },
          handler: async (response) => {
            try {
              await verifyWalletPayment({
                orgId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              resolve();
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error("Payment was cancelled.")) },
        });
        rzp.open();
      });

      setMsg({ type: "success", text: `₹${amt} added to your Voice Wallet!` });
      fetchBalance();
      fetchTransactions();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Top-up failed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Voice Wallet">
      {/* Plan upgrade banner (Starter) */}
      {walletLocked && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0">
              <Lock className="text-white" size={22} />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-bold text-lg text-ink mb-1">Voice Wallet is available on Growth & above</h3>
              <p className="text-sm text-ink-soft">
                Bridge calling, number rent, and voice features draw from your prepaid wallet. Upgrade your plan to top up and start calling leads.
              </p>
            </div>
            <button onClick={() => navigate("/admin/billing")} className="btn btn-primary whitespace-nowrap flex items-center gap-2">
              Upgrade Plan <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Balance hero */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-orange-500 to-amber-500 opacity-5 rounded-bl-full" />
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
                <Wallet className="text-white" size={20} />
              </div>
              <p className="text-sm text-ink-muted">Wallet Balance</p>
            </div>
            {loadingBalance ? (
              <div className="h-10 flex items-center"><Loader2 size={22} className="animate-spin text-ink-muted" /></div>
            ) : (
              <p className="font-display font-bold text-4xl text-ink flex items-center">
                <IndianRupee size={26} />{balance.balanceInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-muted mb-1">Total spent (lifetime)</p>
            <p className="font-display font-bold text-lg text-ink flex items-center justify-end">
              <IndianRupee size={14} />{balance.totalSpentInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            <button onClick={() => { fetchBalance(); fetchTransactions(); }} className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 mt-2 ml-auto">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Prominent minutes cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Bridge minutes */}
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <Zap size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Bridge Minutes</p>
              <p className="text-[11px] text-ink-muted">₹2.20/min · pay when connected</p>
            </div>
          </div>
          <p className="font-display font-bold text-3xl text-ink">
            {Math.floor(balance.balanceInr / BRIDGE_RATE).toLocaleString("en-IN")}
            <span className="text-sm font-normal text-ink-muted ml-1">min</span>
          </p>
        </div>

        {/* AI voice minutes — locked if plan doesn't include AI voice */}
        <div className={`rounded-2xl shadow-card border p-5 relative overflow-hidden ${aiVoiceEnabled ? "bg-white border-cream-300/60" : "bg-purple-50/40 border-purple-200"}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${aiVoiceEnabled ? "bg-purple-100" : "bg-purple-100"}`}>
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">AI Voice Minutes</p>
              <p className="text-[11px] text-ink-muted">₹5/min · auto-call & qualify</p>
            </div>
          </div>
          {aiVoiceEnabled ? (
            <p className="font-display font-bold text-3xl text-ink">
              {Math.floor(balance.balanceInr / AI_RATE).toLocaleString("en-IN")}
              <span className="text-sm font-normal text-ink-muted ml-1">min</span>
            </p>
          ) : (
            <div>
              <p className="font-display font-bold text-3xl text-ink/30">
                {Math.floor(balance.balanceInr / AI_RATE).toLocaleString("en-IN")}
                <span className="text-sm font-normal ml-1">min</span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                  <Lock size={10} /> Locked
                </span>
                <button onClick={() => navigate("/admin/billing")}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-0.5">
                  Upgrade to Scale to unlock <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      {msg.text && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm flex items-center gap-2 ${
          msg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* Top-up */}
      {!walletLocked && (
        <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-orange-500" />
            <h3 className="font-display font-bold text-lg text-ink">Add Money</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(p)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  Number(amount) === p ? "border-orange-500 bg-orange-50 text-orange-600" : "border-cream-300 text-ink-soft hover:border-orange-300"
                }`}>
                ₹{p.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center border border-cream-300 rounded-xl px-3 py-2">
              <IndianRupee size={16} className="text-ink-muted" />
              <input type="number" min={MIN_TOPUP} value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 outline-none text-sm ml-1" placeholder="Amount" />
            </div>
            <button onClick={handleTopUp} disabled={busy} className="btn btn-primary flex items-center gap-2">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Plus size={16} /> Add ₹{Math.round(Number(amount) || 0).toLocaleString("en-IN")}</>}
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-3 flex items-center gap-1.5">
            <Sparkles size={12} className="text-orange-400" /> Balance never expires while your plan is active. Pay only for what you use.
          </p>
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
            <Clock size={16} className="text-orange-500" /> Transaction History
          </h3>
        </div>
        {loadingTxns ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-orange-400" /></div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
              <TrendingUp size={24} className="text-ink-muted" />
            </div>
            <p className="text-sm text-ink-muted">No transactions yet.</p>
            <p className="text-xs text-ink-muted mt-1">Add money to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-cream-100 max-h-[420px] overflow-y-auto">
            {transactions.map((tx, idx) => <TransactionRow key={tx.id || idx} tx={tx} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}

function TransactionRow({ tx }) {
  const isCredit = tx.type === "topup" || tx.type === "credit";
  return (
    <div className="flex items-center gap-4 px-6 py-3.5 hover:bg-cream-50 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isCredit ? "bg-green-100" : "bg-orange-100"}`}>
        {isCredit ? <ArrowDownLeft size={16} className="text-green-600" /> : <ArrowUpRight size={16} className="text-orange-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{tx.description || (isCredit ? "Wallet top-up" : "Usage")}</p>
        <p className="text-xs text-ink-muted">{fmtDate(tx.createdAt || tx.timestamp)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${isCredit ? "text-green-600" : "text-ink"}`}>
          {isCredit ? "+" : "−"}₹{Math.abs(tx.amountInr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}
