"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreditCard, Zap, Check, Star } from "lucide-react";
import api from "@/lib/api";

interface Subscription {
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
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
    price: "$0",
    period: "forever",
    color: "#94a3b8",
    features: [
      "2 database connections",
      "Daily backups only",
      "7 day retention",
      "Email notifications",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$12",
    period: "per month",
    color: "#00b4ff",
    popular: true,
    features: [
      "Unlimited connections",
      "Every 15 min to monthly",
      "90 day retention",
      "Email + Slack",
      "Backup verification",
      "One-click restore",
      "Webhooks",
      "Pre/Post hooks",
      "AI Schema Insights",
    ],
  },
  {
    id: "team",
    label: "Team",
    price: "$39",
    period: "per month",
    color: "#a78bfa",
    features: [
      "Everything in Pro",
      "5 team members",
      "DB Sync (prod → staging)",
      "Connection-level RBAC",
      "Audit log",
      "Compliance PDF export",
      "PagerDuty integration",
      "SLA guarantee",
    ],
  },
];

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  useEffect(() => {
    api.get("/billing/subscription")
      .then((res) => setSub(res.data))
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (plan: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setUpgradingPlan(plan);
    try {
      const orderRes = await api.post("/billing/order", { plan });
      const { order_id, amount, currency, key_id } = orderRes.data;

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
        amount,
        currency,
        name: "SnapBase",
        description: plan === "pro" ? "SnapBase Pro - Monthly" : "SnapBase Team - Monthly",
        order_id,
        prefill: { email: userEmail },
        theme: { color: "#00b4ff" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          await api.post("/billing/verify", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            plan,
          });
          window.location.href = "/dashboard?upgraded=true";
        },
        modal: {
          ondismiss: () => setUpgradingPlan(null),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setUpgradingPlan(null);
    } catch {
      setUpgradingPlan(null);
    }
  };

  const cardStyle = {
    background: "rgba(13,21,38,0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "1rem",
  };

  const currentPlan = sub?.plan ?? "free";
  const planOrder = ["free", "pro", "team"];
  const currentPlanIndex = planOrder.indexOf(currentPlan);
  const currentDetails = plans.find((p) => p.id === currentPlan) ?? plans[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-grotesk text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your plan and subscription.</p>
      </div>

      {/* Current plan banner */}
      {!loading && (
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${currentDetails.color}15`, border: `1px solid ${currentDetails.color}25` }}
            >
              <CreditCard className="h-5 w-5" style={{ color: currentDetails.color }} />
            </div>
            <div>
              <p className="font-grotesk text-sm font-semibold text-white">
                Current Plan:{" "}
                <span style={{ color: currentDetails.color }}>{currentDetails.label}</span>
                {currentPlan !== "free" && <span className="ml-2 text-[#00ff88]">✓ Active</span>}
              </p>
              {sub?.current_period_end && (
                <p className="mt-0.5 font-jetbrains text-[11px] text-slate-500">
                  Renews {new Date(sub.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = planOrder.indexOf(plan.id) > currentPlanIndex;
          const isDowngrade = planOrder.indexOf(plan.id) < currentPlanIndex;

          return (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-2xl p-6"
              style={{
                background: isCurrent
                  ? `linear-gradient(135deg, ${plan.color}10, ${plan.color}05)`
                  : "rgba(13,21,38,0.8)",
                backdropFilter: "blur(12px)",
                border: isCurrent
                  ? `1px solid ${plan.color}40`
                  : "1px solid rgba(255,255,255,0.06)",
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

              <div className="mb-4 flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: plan.color }} />
                <span className="font-grotesk text-sm font-semibold" style={{ color: plan.color }}>
                  {plan.label}
                </span>
              </div>

              <div className="mb-6">
                <span className="font-grotesk text-3xl font-bold text-white">{plan.price}</span>
                <span className="ml-1 text-xs text-slate-500">{plan.period}</span>
              </div>

              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: plan.color }} />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="rounded-xl border border-white/[0.06] py-2 text-center text-sm font-semibold text-slate-500">
                  Your current plan
                </div>
              ) : isUpgrade ? (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgradingPlan === plan.id}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50"
                  style={
                    plan.id === "team"
                      ? { background: "linear-gradient(135deg, #a78bfa, #7c3aed)" }
                      : { background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }
                  }
                >
                  <Zap className="h-3.5 w-3.5" />
                  {upgradingPlan === plan.id ? "Loading…" : `Upgrade to ${plan.label}`}
                </button>
              ) : isDowngrade ? (
                <div className="rounded-xl border border-white/[0.06] py-2 text-center text-xs text-slate-600">
                  Downgrade not available here
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-600">
        Payments processed securely via Razorpay.{" "}
        <Link href="/pricing" className="text-slate-400 hover:text-white">
          View full feature comparison →
        </Link>
      </p>
    </div>
  );
}
