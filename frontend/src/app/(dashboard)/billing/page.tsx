"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CreditCard, Zap, Check, Star, Receipt, AlertTriangle, Sparkles, HardDrive, X } from "lucide-react";
import api from "@/lib/api";

interface Subscription {
  plan: string;
  status: string;
  period: string;
  trial_ends_at: string | null;
  trial_days_left?: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  amount_cents: number;
  effective_plan: string;
}

interface Invoice {
  id: number;
  amount_cents: number;
  currency: string;
  status: string;
  description: string;
  paid_at: string | null;
  created_at: string;
}

interface StorageAddon {
  id: number;
  pack_size_gb: number;
  amount_cents: number;
  status: string;
  current_period_end: string | null;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

const plans = [
  {
    id: "free",
    label: "Free",
    monthly: 0,
    annual: 0,
    color: "#94a3b8",
    features: [
      "2 database connections",
      "Daily backups only",
      "1 GB storage",
      "7 day retention",
      "Email notifications",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    monthly: 9,
    annual: 90,
    color: "#00b4ff",
    popular: true,
    features: [
      "5 connections",
      "Every 15min — monthly schedules",
      "10 GB storage",
      "30 day retention",
      "Email + Slack",
      "Webhooks + Pre/Post hooks",
      "AI Schema Insights",
    ],
  },
  {
    id: "team",
    label: "Team",
    monthly: 49,
    annual: 490,
    color: "#a78bfa",
    features: [
      "Everything in Pro",
      "Unlimited connections",
      "100 GB storage",
      "90 day retention",
      "5 team members + RBAC",
      "DB Sync + Audit log",
      "Compliance PDF",
      "SLA",
    ],
  },
  {
    id: "business",
    label: "Business",
    monthly: 149,
    annual: 1490,
    color: "#f59e0b",
    features: [
      "Everything in Team",
      "500 GB storage",
      "365 day retention",
      "25 team members",
      "HIPAA BAA + SOC2",
      "Immutable backups",
      "Auto test-restore",
      "Dedicated support",
    ],
  },
];

const planOrder = ["free", "pro", "team", "business"];

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [addons, setAddons] = useState<StorageAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.get("/billing/subscription").then((res) => setSub(res.data)).finally(() => setLoading(false));
    api.get("/billing/invoices").then((res) => setInvoices(res.data)).catch(() => {});
    api.get("/storage-addons").then((res) => setAddons(res.data)).catch(() => {});
  }, []);

  const buyStoragePack = async (pack: "50" | "100") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setBuyingPack(pack);
    try {
      const res = await api.post("/storage-addons/checkout", { pack });
      const { subscription_id, key_id } = res.data;
      await new Promise<void>((resolve, reject) => {
        if (window.Razorpay) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });
      let userEmail = "";
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        userEmail = payload.email || "";
      } catch { /* ignore */ }
      const options = {
        key: key_id,
        subscription_id,
        name: "SnapBase",
        description: `Storage add-on +${pack}GB`,
        prefill: { email: userEmail },
        theme: { color: "#00f5d4" },
        handler: async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          await api.post("/storage-addons/verify", response);
          refresh();
        },
        modal: { ondismiss: () => setBuyingPack(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
      setBuyingPack(null);
    } catch (err) {
      setBuyingPack(null);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
    }
  };

  const cancelPack = async (id: number) => {
    if (!confirm("Cancel this storage pack at the end of the current period?")) return;
    try {
      await api.post("/storage-addons/cancel", { id });
      refresh();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || "Failed to cancel");
    }
  };

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpgrade = async (plan: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setUpgradingPlan(plan);
    const period = annual ? "annual" : "monthly";
    try {
      const res = await api.post("/billing/checkout", { plan, period });
      const { subscription_id, key_id } = res.data;

      await new Promise<void>((resolve, reject) => {
        if (window.Razorpay) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });

      let userEmail = "";
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        userEmail = payload.email || "";
      } catch { /* ignore */ }

      const options = {
        key: key_id,
        subscription_id,
        name: "SnapBase",
        description: `SnapBase ${plan[0].toUpperCase() + plan.slice(1)} — ${period === "annual" ? "Annual" : "Monthly"}`,
        prefill: { email: userEmail },
        theme: { color: "#00b4ff" },
        handler: async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          await api.post("/billing/verify", {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_signature: response.razorpay_signature,
          });
          window.location.href = "/dashboard?upgraded=true";
        },
        modal: { ondismiss: () => setUpgradingPlan(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
      setUpgradingPlan(null);
    } catch (err) {
      setUpgradingPlan(null);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll keep access until the end of your billing period, then drop to the Free plan.")) return;
    setActionLoading("cancel");
    try {
      await api.post("/billing/cancel");
      refresh();
    } catch (err) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to cancel");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    setActionLoading("resume");
    try {
      await api.post("/billing/resume");
      refresh();
    } catch (err) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to resume");
    } finally {
      setActionLoading(null);
    }
  };

  const cardStyle = {
    background: "rgba(13,21,38,0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "1rem",
  };

  const effective = sub?.effective_plan ?? "free";
  const currentDetails = plans.find((p) => p.id === effective) ?? plans[0];
  const currentPlanIndex = planOrder.indexOf(effective);
  const isTrialing = sub?.status === "trialing" && sub.trial_ends_at;
  const trialDaysLeft = sub?.trial_days_left ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-grotesk text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your plan, invoices, and add-ons.</p>
      </div>

      {/* Trial banner */}
      {isTrialing && trialDaysLeft >= 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#00b4ff]/20 bg-[#00b4ff]/5 p-4">
          <Sparkles className="h-5 w-5 shrink-0 text-[#00b4ff]" />
          <div className="flex-1">
            <p className="font-grotesk text-sm font-semibold text-white">
              You&apos;re on the Pro free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Add a payment method to keep Pro features after your trial ends.
            </p>
          </div>
          <button
            onClick={() => handleUpgrade("pro")}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
          >
            Keep Pro
          </button>
        </div>
      )}

      {/* Cancel-at-period-end banner */}
      {sub?.cancel_at_period_end && sub.current_period_end && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="font-grotesk text-sm font-semibold text-white">
              Subscription ending {new Date(sub.current_period_end).toLocaleDateString()}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              You&apos;ll lose Pro features and drop to Free unless you resume.
            </p>
          </div>
          <button
            onClick={handleResume}
            disabled={actionLoading === "resume"}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
          >
            {actionLoading === "resume" ? "Resuming…" : "Resume"}
          </button>
        </div>
      )}

      {/* Current plan summary */}
      {!loading && sub && (
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${currentDetails.color}15`, border: `1px solid ${currentDetails.color}25` }}
              >
                <CreditCard className="h-5 w-5" style={{ color: currentDetails.color }} />
              </div>
              <div>
                <p className="font-grotesk text-sm font-semibold text-white">
                  Current Plan: <span style={{ color: currentDetails.color }}>{currentDetails.label}</span>
                  {sub.status === "active" && <span className="ml-2 text-[#00ff88]">✓ Active</span>}
                  {sub.status === "trialing" && <span className="ml-2 text-[#00b4ff]">Trial</span>}
                  {sub.status === "halted" && <span className="ml-2 text-red-400">Payment failed</span>}
                </p>
                {sub.current_period_end && sub.status === "active" && (
                  <p className="mt-0.5 font-jetbrains text-[11px] text-slate-500">
                    {sub.cancel_at_period_end ? "Ends" : "Renews"} {new Date(sub.current_period_end).toLocaleDateString()}
                    {sub.period && ` · ${sub.period}`}
                  </p>
                )}
              </div>
            </div>
            {sub.status === "active" && !sub.cancel_at_period_end && effective !== "free" && (
              <button
                onClick={handleCancel}
                disabled={actionLoading === "cancel"}
                className="text-xs text-slate-500 underline transition hover:text-red-300"
              >
                {actionLoading === "cancel" ? "Cancelling…" : "Cancel subscription"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Period toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${!annual ? "text-white" : "text-slate-500"}`}>Monthly</span>
        <button
          onClick={() => setAnnual((v) => !v)}
          className="relative h-6 w-11 rounded-full border border-white/10 transition-colors"
          style={{ background: annual ? "linear-gradient(135deg, #00b4ff, #00f5d4)" : "rgba(255,255,255,0.08)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
            style={{ left: annual ? "calc(100% - 1.25rem)" : "0.25rem" }}
          />
        </button>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${annual ? "text-white" : "text-slate-500"}`}>
          Annual
          <span className="rounded-full bg-[#00ff88]/10 px-2 py-0.5 text-[10px] font-semibold text-[#00ff88]">Save 17%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === effective;
          const isUpgrade = planOrder.indexOf(plan.id) > currentPlanIndex;
          const price = annual ? Math.round(plan.annual / 12 * 10) / 10 : plan.monthly;

          return (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-2xl p-6"
              style={{
                background: isCurrent
                  ? `linear-gradient(135deg, ${plan.color}10, ${plan.color}05)`
                  : "rgba(13,21,38,0.8)",
                backdropFilter: "blur(12px)",
                border: isCurrent ? `1px solid ${plan.color}40` : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "1rem",
              }}
            >
              {plan.popular && !isCurrent && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-semibold text-[#0a0f1e]"
                  style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
                >
                  Most Popular
                </div>
              )}
              {isCurrent && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-semibold"
                  style={{ background: `${plan.color}25`, color: plan.color, border: `1px solid ${plan.color}40` }}
                >
                  Current Plan
                </div>
              )}

              <div className="mb-3 flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: plan.color }} />
                <span className="font-grotesk text-sm font-semibold" style={{ color: plan.color }}>{plan.label}</span>
              </div>

              <div className="mb-5">
                <span className="font-grotesk text-3xl font-bold text-white">${price}</span>
                <span className="ml-1 text-xs text-slate-500">{plan.monthly === 0 ? "forever" : "/mo"}</span>
                {annual && plan.annual > 0 && (
                  <p className="mt-1 font-jetbrains text-[11px] text-slate-500">${plan.annual} billed annually</p>
                )}
              </div>

              <ul className="mb-6 flex-1 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: plan.color }} />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="rounded-xl border border-white/[0.06] py-2 text-center text-xs font-semibold text-slate-500">
                  Your current plan
                </div>
              ) : isUpgrade ? (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgradingPlan === plan.id || plan.id === "free"}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)` }}
                >
                  <Zap className="h-3 w-3" />
                  {upgradingPlan === plan.id ? "Loading…" : `Upgrade to ${plan.label}`}
                </button>
              ) : (
                <div className="rounded-xl border border-white/[0.06] py-2 text-center text-[10px] text-slate-600">
                  Downgrade at /pricing
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Storage add-on packs */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[#00f5d4]" />
          <h2 className="font-grotesk text-sm font-semibold text-white">Storage add-on packs</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Need more storage but don&apos;t want to upgrade your plan? Stack add-on packs on top of your current plan limit.
        </p>

        {/* Active packs */}
        {addons.filter(a => a.status === "active").length > 0 && (
          <div className="mb-4 space-y-2">
            {addons.filter(a => a.status === "active").map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-[#00f5d4]/20 bg-[#00f5d4]/5 px-4 py-3">
                <div>
                  <p className="font-grotesk text-sm font-semibold text-white">+{a.pack_size_gb} GB pack</p>
                  <p className="mt-0.5 font-jetbrains text-[11px] text-slate-500">
                    ${(a.amount_cents / 100).toFixed(2)}/mo
                    {a.current_period_end && ` · renews ${new Date(a.current_period_end).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => cancelPack(a.id)}
                  className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:border-red-500/30 hover:text-red-300"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Buy packs */}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { pack: "50" as const, gb: 50, price: 5 },
            { pack: "100" as const, gb: 100, price: 9 },
          ].map((p) => (
            <div key={p.pack} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-grotesk text-sm font-semibold text-white">+{p.gb} GB</p>
                <p className="font-grotesk text-lg font-bold text-[#00f5d4]">${p.price}<span className="text-xs text-slate-500">/mo</span></p>
              </div>
              <p className="mb-3 text-xs text-slate-500">${(p.price * 100 / p.gb / 100).toFixed(3)}/GB · cancel anytime</p>
              <button
                onClick={() => buyStoragePack(p.pack)}
                disabled={buyingPack === p.pack}
                className="w-full rounded-xl py-2 text-xs font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #00f5d4, #00b4ff)" }}
              >
                {buyingPack === p.pack ? "Loading…" : `Buy +${p.gb} GB pack`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Invoices */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[#00b4ff]" />
          <h2 className="font-grotesk text-sm font-semibold text-white">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">No invoices yet — your first charge will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="text-slate-300">
                    <td className="py-2 font-jetbrains text-slate-500">
                      {new Date(inv.paid_at || inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">{inv.description || "Subscription charge"}</td>
                    <td className="py-2 text-right font-jetbrains text-white">
                      ${(inv.amount_cents / 100).toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        inv.status === "paid" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-600">
        Payments processed securely via Razorpay.{" "}
        <Link href="/pricing" className="text-slate-400 hover:text-white">
          Full plan comparison →
        </Link>
      </p>
    </div>
  );
}
