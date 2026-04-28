"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Zap, Check } from "lucide-react";
import api from "@/lib/api";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentPlan: string;
  used?: number;
  limit?: number;
  reason?: "connections" | "storage" | "feature";
  feature?: string; // e.g. "Webhooks", "AI Insights"
  onUpgraded?: () => void;
}

const planUpgrades: Record<string, { id: string; label: string; price: number; annual: number; features: string[]; color: string }> = {
  free: {
    id: "pro",
    label: "Pro",
    price: 9,
    annual: 90,
    color: "#00b4ff",
    features: [
      "5 connections (up from 2)",
      "Schedules every 15 min",
      "10 GB storage (up from 1 GB)",
      "30-day retention",
      "Webhooks + Pre/Post hooks",
      "AI Schema Insights",
      "Slack notifications",
    ],
  },
  pro: {
    id: "team",
    label: "Team",
    price: 49,
    annual: 490,
    color: "#a78bfa",
    features: [
      "Unlimited connections",
      "100 GB storage",
      "90-day retention",
      "5 team members + RBAC",
      "DB Sync (prod → staging)",
      "Audit log + Compliance PDF",
      "SLA guarantee",
    ],
  },
  team: {
    id: "business",
    label: "Business",
    price: 149,
    annual: 1490,
    color: "#f59e0b",
    features: [
      "500 GB storage",
      "365-day retention",
      "25 team members",
      "HIPAA BAA + SOC2 report",
      "Immutable backups (WORM)",
      "Auto test-restore weekly",
      "Dedicated support channel",
    ],
  },
};

export default function UpgradeModal({
  open, onOpenChange, currentPlan, used, limit, reason = "connections", feature, onUpgraded,
}: Props) {
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(false);
  const target = planUpgrades[currentPlan] ?? planUpgrades["free"];

  const handleUpgrade = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setLoading(true);
    const period = annual ? "annual" : "monthly";
    try {
      const res = await api.post("/billing/checkout", { plan: target.id, period });
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
        description: `SnapBase ${target.label} — ${period === "annual" ? "Annual" : "Monthly"}`,
        prefill: { email: userEmail },
        theme: { color: target.color },
        handler: async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          await api.post("/billing/verify", {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_signature: response.razorpay_signature,
          });
          onUpgraded?.();
        },
        modal: { ondismiss: () => setLoading(false) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
      setLoading(false);
    } catch (err) {
      setLoading(false);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
    }
  };

  const headline = (() => {
    if (reason === "storage") return "Storage limit reached";
    if (reason === "feature") return `${feature ?? "This feature"} is on ${target.label}`;
    return "You've hit your plan limit";
  })();

  const subline = (() => {
    if (reason === "storage") return `You've used all of your storage on the ${currentPlan} plan. Upgrade to ${target.label} for more, or buy a +50 GB add-on pack.`;
    if (reason === "feature") return `Upgrade to ${target.label} to unlock ${feature ?? "this feature"} along with everything else.`;
    return `${currentPlan === "free" ? "Free" : currentPlan} allows ${limit} connection${limit === 1 ? "" : "s"}${used !== undefined ? ` and you have ${used}` : ""}. Upgrade to ${target.label} to add more.`;
  })();

  const priceShown = annual ? Math.round(target.annual / 12 * 10) / 10 : target.price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md text-white"
        style={{ background: "#0d1526", border: `1px solid ${target.color}30`, borderRadius: "1.25rem" }}
      >
        <DialogHeader>
          <DialogTitle className="font-grotesk text-lg font-semibold text-white">{headline}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">{subline}</p>

          <div
            className="rounded-2xl p-5"
            style={{ background: `linear-gradient(135deg, ${target.color}10, ${target.color}05)`, border: `1px solid ${target.color}30` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: target.color }} />
                <span className="font-grotesk text-sm font-semibold" style={{ color: target.color }}>
                  Upgrade to {target.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className={annual ? "text-slate-500" : "text-white"}>Monthly</span>
                <button
                  onClick={() => setAnnual((v) => !v)}
                  className="relative h-4 w-7 rounded-full border border-white/10"
                  style={{ background: annual ? target.color : "rgba(255,255,255,0.1)" }}
                >
                  <span
                    className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform"
                    style={{ left: annual ? "calc(100% - 0.875rem)" : "0.125rem" }}
                  />
                </button>
                <span className={annual ? "text-white" : "text-slate-500"}>
                  Annual <span className="text-[#00ff88]">−17%</span>
                </span>
              </div>
            </div>

            <div className="mb-4">
              <span className="font-grotesk text-3xl font-bold text-white">${priceShown}</span>
              <span className="ml-1 text-xs text-slate-500">/mo {annual && `(billed $${target.annual}/yr)`}</span>
            </div>

            <ul className="space-y-1.5">
              {target.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: target.color }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-center text-[11px] text-slate-600">
            Cancel anytime · 30-day money-back guarantee · Secured by Razorpay
          </p>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs text-slate-400 transition hover:text-white"
            >
              Maybe later
            </button>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${target.color}, ${target.color}cc)` }}
            >
              <Zap className="h-3.5 w-3.5" />
              {loading ? "Loading…" : `Upgrade to ${target.label}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
