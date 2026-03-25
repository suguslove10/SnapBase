"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreditCard, Zap, Check } from "lucide-react";
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

const planDetails: Record<string, { label: string; color: string; features: string[] }> = {
  free: {
    label: "Free",
    color: "#94a3b8",
    features: ["2 database connections", "Daily backups only", "7 day retention", "Email notifications"],
  },
  pro: {
    label: "Pro",
    color: "#00b4ff",
    features: ["Unlimited connections", "Every 15 min to monthly", "90 day retention", "Email + Slack", "Backup verification", "One-click restore"],
  },
  team: {
    label: "Team",
    color: "#a78bfa",
    features: ["Everything in Pro", "5 team members", "Audit log", "Compliance PDF export", "PagerDuty integration", "SLA guarantee"],
  },
};

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

  const plan = sub?.plan ?? "free";
  const details = planDetails[plan] ?? planDetails.free;
  const isPaid = plan !== "free";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-grotesk text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your plan and subscription.</p>
      </div>

      {/* Current plan card */}
      <div className="rounded-2xl p-6" style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${details.color}15`, border: `1px solid ${details.color}25` }}
            >
              <CreditCard className="h-5 w-5" style={{ color: details.color }} />
            </div>
            <div>
              <p className="font-grotesk text-sm font-semibold text-white">
                Current Plan:{" "}
                <span style={{ color: details.color }}>{details.label}</span>
                {isPaid && <span className="ml-2 text-[#00ff88]">✓ Active</span>}
              </p>
              {!loading && sub?.current_period_end && (
                <p className="mt-0.5 font-jetbrains text-[11px] text-slate-500">
                  Renews {new Date(sub.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {!isPaid && (
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={upgradingPlan === "pro"}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              <Zap className="h-3.5 w-3.5" />
              {upgradingPlan === "pro" ? "Loading…" : "Upgrade to Pro"}
            </button>
          )}
        </div>

        {/* Plan features */}
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {details.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: details.color }} />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Upgrade CTA for free users */}
      {!loading && plan === "free" && (
        <div
          className="rounded-2xl border border-[#00b4ff]/20 p-8 text-center"
          style={{ background: "rgba(0,180,255,0.04)" }}
        >
          <Zap className="mx-auto mb-3 h-7 w-7 text-[#00b4ff]" />
          <h2 className="font-grotesk text-xl font-bold text-white">Unlock more with Pro</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            Unlimited connections, frequent backups, and priority support — $12/mo.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={upgradingPlan === "pro"}
              className="rounded-xl px-8 py-3 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              {upgradingPlan === "pro" ? "Loading…" : "Upgrade to Pro — $12/mo"}
            </button>
            <Link href="/pricing" className="text-sm text-slate-400 transition hover:text-white">
              View all plans
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
