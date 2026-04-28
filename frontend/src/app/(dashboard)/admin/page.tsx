"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Users, Sparkles, AlertTriangle, DollarSign, BarChart3 } from "lucide-react";
import api from "@/lib/api";

interface Metrics {
  generated_at: string;
  mrr_cents: number;
  arr_cents: number;
  active_paid: number;
  trialing: number;
  plan_breakdown: { plan: string; period: string; count: number; amount_cents: number }[];
  total_users: number;
  signups_7d: number;
  signups_30d: number;
  trial_to_paid_30d: number;
  trials_started_30d: number;
  trials_converted_30d: number;
  churned_30d: number;
  revenue_30d_cents: number;
  total_backups: number;
  backups_24h: number;
}

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function AdminMetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/admin/metrics")
      .then((res) => setM(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load metrics"));
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
          {error} — Set <code className="font-jetbrains text-red-200">ADMIN_EMAILS</code> env var to allow your email.
        </div>
      </div>
    );
  }

  if (!m) return <div className="p-6 text-sm text-slate-500">Loading metrics…</div>;

  const kpis = [
    { label: "MRR",       val: dollars(m.mrr_cents),     sub: "Monthly Recurring Revenue", icon: DollarSign,  color: "#00ff88" },
    { label: "ARR",       val: dollars(m.arr_cents),     sub: "Annual Run Rate",          icon: TrendingUp,  color: "#00b4ff" },
    { label: "Paid Subs", val: m.active_paid.toString(), sub: `+ ${m.trialing} on trial`, icon: Sparkles,    color: "#00f5d4" },
    { label: "Users",     val: m.total_users.toString(), sub: `+${m.signups_7d} this week`, icon: Users,     color: "#a78bfa" },
    { label: "Trial → Paid", val: `${m.trial_to_paid_30d.toFixed(0)}%`, sub: `${m.trials_converted_30d}/${m.trials_started_30d} last 30d`, icon: BarChart3, color: "#fbbf24" },
    { label: "Churned 30d",  val: m.churned_30d.toString(), sub: `Revenue 30d: ${dollars(m.revenue_30d_cents)}`, icon: AlertTriangle, color: m.churned_30d > 0 ? "#f87171" : "#94a3b8" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Admin Metrics</h1>
          <p className="mt-1 text-sm text-slate-500">Business KPIs · {new Date(m.generated_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl p-5" style={{ ...cardStyle, background: `${k.color}08`, borderColor: `${k.color}25` }}>
            <div className="flex items-center justify-between">
              <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">{k.label}</p>
              <k.icon className="h-4 w-4" style={{ color: k.color, opacity: 0.6 }} />
            </div>
            <p className="mt-2 font-grotesk text-3xl font-bold text-white">{k.val}</p>
            <p className="mt-1 font-jetbrains text-[11px]" style={{ color: k.color, opacity: 0.7 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="mb-4 font-grotesk text-sm font-semibold text-white">Plan breakdown</h2>
        {m.plan_breakdown.length === 0 ? (
          <p className="text-xs text-slate-600">No paid subscriptions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2">Plan</th>
                <th className="pb-2">Period</th>
                <th className="pb-2 text-right">Customers</th>
                <th className="pb-2 text-right">Per-customer</th>
                <th className="pb-2 text-right">MRR contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {m.plan_breakdown.map((p, i) => {
                const monthlyEq = p.period === "annual" ? p.amount_cents / 12 : p.amount_cents;
                return (
                  <tr key={i} className="text-slate-300">
                    <td className="py-2 capitalize">{p.plan}</td>
                    <td className="py-2 text-xs text-slate-500">{p.period}</td>
                    <td className="py-2 text-right font-jetbrains">{p.count}</td>
                    <td className="py-2 text-right font-jetbrains">${(p.amount_cents / 100).toFixed(0)}</td>
                    <td className="py-2 text-right font-jetbrains text-[#00ff88]">${(monthlyEq * p.count / 100).toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h3 className="mb-3 font-grotesk text-sm font-semibold text-white">Activity</h3>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex justify-between"><span>Total backups all-time</span><span className="font-jetbrains text-white">{m.total_backups.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Backups in last 24h</span><span className="font-jetbrains text-[#00ff88]">{m.backups_24h.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Signups 7-day</span><span className="font-jetbrains text-white">{m.signups_7d}</span></div>
            <div className="flex justify-between"><span>Signups 30-day</span><span className="font-jetbrains text-white">{m.signups_30d}</span></div>
          </div>
        </div>
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h3 className="mb-3 font-grotesk text-sm font-semibold text-white">Funnel</h3>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex justify-between"><span>Trials started 30d</span><span className="font-jetbrains text-white">{m.trials_started_30d}</span></div>
            <div className="flex justify-between"><span>Trials converted</span><span className="font-jetbrains text-[#00ff88]">{m.trials_converted_30d}</span></div>
            <div className="flex justify-between"><span>Churned 30d</span><span className="font-jetbrains text-amber-300">{m.churned_30d}</span></div>
            <div className="flex justify-between"><span>Revenue 30d</span><span className="font-jetbrains text-[#00ff88]">{dollars(m.revenue_30d_cents)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
