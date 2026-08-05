import { useState, useEffect, useCallback } from "react";
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
import { ADD_ONS } from "../../data/plans";
import {
  Wallet,
  Phone,
  Bot,
  Plus,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

// ── Wallet packs from plans.js
const BRIDGE_PACK = ADD_ONS.find((a) => a.id === "voice_bridge_pack");
const AI_PACK = ADD_ONS.find((a) => a.id === "voice_ai_pack");

const TOPUP_PACKS = [
  {
    id: "voice_bridge_pack",
    name: "Bridge Call Minutes",
    description: "Masked & recorded bridge calls",
    price: BRIDGE_PACK?.price || 1999,
    minutes: 1000,
    rate: "₹2/min",
    icon: Phone,
    color: "from-blue-500 to-indigo-600",
    bgLight: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-700",
  },
  {
    id: "voice_ai_pack",
    name: "AI Voice Bot Minutes",
    description: "Auto-call, qualify & warm-transfer",
    price: AI_PACK?.price || 3999,
    minutes: 500,
    rate: "₹8/min",
    icon: Bot,
    color: "from-purple-500 to-pink-600",
    bgLight: "bg-purple-50",
    borderColor: "border-purple-200",
    textColor: "text-purple-700",
  },
];

const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

export default function VoiceWallet() {
  const { org } = useBilling();
  const { user } = useAuth();

  const [balance, setBalance] = useState({ bridgeMinutes: 0, aiMinutes: 0, totalSpentInr: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingTxns, setLoadingTxns] = useState(true);
  const [busy, setBusy] = useState(null); // packId being purchased
  const [msg, setMsg] = useState({ type: "", text: "" });

  const orgId = org?.id;

  // ── Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!orgId) return;
    setLoadingBalance(true);
    try {
      const data = await getWalletBalance(orgId);
      setBalance({
        bridgeMinutes: data.bridgeMinutes ?? data.balanceMinutes ?? 0,
        aiMinutes: data.aiMinutes ?? 0,
        totalSpentInr: data.totalSpentInr ?? 0,
      });
    } catch (e) {
      console.warn("Wallet balance fetch:", e.message);
    } finally {
      setLoadingBalance(false);
    }
  }, [orgId]);

  // ── Fetch transactions
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

  // ── Top-up via Razorpay
  const handleTopUp = async (pack) => {
    setMsg({ type: "", text: "" });
    setBusy(pack.id);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Razorpay checkout failed to load. Please try again.");

      const order = await createWalletOrder({
        orgId,
        packId: pack.id,
        amount: pack.price,
      });

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          order_id: order.orderId,
          name: "Codeskate CRM",
          description: `Voice Wallet: ${pack.name} (${pack.minutes} mins)`,
          prefill: {
            name: user?.displayName || "",
            contact: (user?.phone || "").replace("+91", ""),
          },
          theme: { color: "#F04E00" },
          handler: async (response) => {
            try {
              await verifyWalletPayment({
                orgId,
                packId: pack.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment was cancelled.")),
          },
        });
        rzp.open();
      });

      // Success — refresh balance + transactions
      setMsg({ type: "success", text: `${pack.minutes} minutes added to your ${pack.name} wallet!` });
      fetchBalance();
      fetchTransactions();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Top-up failed. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout title="Voice Wallet">
      {/* ── Hero balance cards ── */}
      <div className="grid sm:grid-cols-2 gap-5 mb-6">
        <BalanceCard
          icon={Phone}
          label="Bridge Call Minutes"
          balance={balance.bridgeMinutes}
          rate="₹2/min"
          gradient="from-blue-500 to-indigo-600"
          loading={loadingBalance}
        />
        <BalanceCard
          icon={Bot}
          label="AI Voice Bot Minutes"
          balance={balance.aiMinutes}
          rate="₹8/min"
          gradient="from-purple-500 to-pink-600"
          loading={loadingBalance}
        />
      </div>

      {/* ── Wallet summary strip ── */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Wallet className="text-white" size={20} />
          </div>
          <div>
            <p className="text-sm text-ink-muted">Total spent (lifetime)</p>
            <p className="font-display font-bold text-xl text-ink flex items-center gap-1">
              <IndianRupee size={16} />
              {balance.totalSpentInr.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
        <button
          onClick={() => { fetchBalance(); fetchTransactions(); }}
          className="btn btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Status message ── */}
      {msg.text && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm flex items-center gap-2 ${
          msg.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* ── Top-up packs ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} className="text-orange-500" />
          <h3 className="font-display font-bold text-lg text-ink">Top Up Your Wallet</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {TOPUP_PACKS.map((pack) => (
            <TopUpCard
              key={pack.id}
              pack={pack}
              busy={busy === pack.id}
              onTopUp={() => handleTopUp(pack)}
            />
          ))}
        </div>
        <p className="text-xs text-ink-muted mt-3 flex items-center gap-1.5">
          <Sparkles size={12} className="text-orange-400" />
          Minutes never expire while your plan is active. Pay only for what you use.
        </p>
      </div>

      {/* ── Transaction history ── */}
      <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Transaction History
          </h3>
        </div>
        {loadingTxns ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-orange-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cream-100 flex items-center justify-center mb-3">
              <TrendingUp size={24} className="text-ink-muted" />
            </div>
            <p className="text-sm text-ink-muted">No transactions yet.</p>
            <p className="text-xs text-ink-muted mt-1">Top up your wallet to get started with voice calling.</p>
          </div>
        ) : (
          <div className="divide-y divide-cream-100 max-h-[420px] overflow-y-auto">
            {transactions.map((tx, idx) => (
              <TransactionRow key={tx.id || idx} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Sub-components ──

function BalanceCard({ icon: Icon, label, balance, rate, gradient, loading }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-cream-300/60 p-6 relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-5 rounded-bl-full`} />
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
          <Icon className="text-white" size={22} />
        </div>
        <span className="text-xs font-medium text-ink-muted bg-cream-100 px-2 py-1 rounded-md">{rate}</span>
      </div>
      <p className="text-sm text-ink-muted mb-1">{label}</p>
      {loading ? (
        <div className="h-9 flex items-center"><Loader2 size={20} className="animate-spin text-ink-muted" /></div>
      ) : (
        <p className="font-display font-bold text-3xl text-ink">
          {balance.toLocaleString("en-IN")}
          <span className="text-sm font-normal text-ink-muted ml-1.5">mins</span>
        </p>
      )}
    </div>
  );
}

function TopUpCard({ pack, busy, onTopUp }) {
  const Icon = pack.icon;
  return (
    <div className={`rounded-2xl border ${pack.borderColor} ${pack.bgLight} p-6 flex flex-col`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pack.color} flex items-center justify-center`}>
          <Icon className="text-white" size={18} />
        </div>
        <div>
          <h4 className="font-display font-bold text-base text-ink">{pack.name}</h4>
          <p className="text-xs text-ink-muted">{pack.description}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display font-bold text-2xl text-ink">₹{pack.price.toLocaleString("en-IN")}</span>
        <span className="text-sm text-ink-muted">/ {pack.minutes.toLocaleString("en-IN")} mins</span>
      </div>
      <p className="text-xs text-ink-muted mb-4">Effective rate: {pack.rate}</p>
      <button
        onClick={onTopUp}
        disabled={busy}
        className="mt-auto btn btn-primary w-full flex items-center justify-center gap-2"
      >
        {busy ? (
          <><Loader2 size={16} className="animate-spin" /> Processing...</>
        ) : (
          <><Plus size={16} /> Top Up Now</>
        )}
      </button>
    </div>
  );
}

function TransactionRow({ tx }) {
  const isCredit = tx.type === "topup" || tx.type === "credit";
  return (
    <div className="flex items-center gap-4 px-6 py-3.5 hover:bg-cream-50 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isCredit ? "bg-green-100" : "bg-orange-100"
      }`}>
        {isCredit
          ? <ArrowDownLeft size={16} className="text-green-600" />
          : <ArrowUpRight size={16} className="text-orange-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">
          {tx.description || (isCredit ? "Wallet top-up" : "Call usage")}
        </p>
        <p className="text-xs text-ink-muted">{fmtDate(tx.createdAt || tx.timestamp)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${isCredit ? "text-green-600" : "text-ink"}`}>
          {isCredit ? "+" : "−"}{Math.abs(tx.minutes || 0).toLocaleString("en-IN")} mins
        </p>
        {tx.amountInr != null && (
          <p className="text-xs text-ink-muted">₹{tx.amountInr.toLocaleString("en-IN")}</p>
        )}
      </div>
    </div>
  );
}
