"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, HardDrive, CalendarClock, CheckCircle, XCircle, ShieldCheck, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import api from "@/lib/api";

interface Stats {
  total_backups: number;
  storage_used: number;
  active_schedules: number;
  last_backup_status: string;
  verification_rate: number;
  unresolved_anomalies: number;
  week_backups: number;
}

interface ChartPoint {
  day: string;
  success: number;
  failed: number;
}

interface Activity {
  id: number;
  name: string;
  type: string;
  status: string;
  size_bytes: number;
  started_at: string;
}

interface ConnHealth {
  id: number;
  name: string;
  type: string;
  last_status: string;
  has_anomaly: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function relativeTime(date: string): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg width="80" height="20" viewBox="0 0 80 20" className="mt-1.5 opacity-30">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        points="0,16 10,13 20,15 30,10 40,12 50,6 60,8 70,3 80,5" />
    </svg>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [health, setHealth] = useState<ConnHealth[]>([]);

  useEffect(() => {
    api.get("/backups/stats").then((res) => setStats(res.data));
    api.get("/backups/chart").then((res) => setChartData(res.data));
    api.get("/backups/activity").then((res) => setActivity(res.data));
    api.get("/connections/health").then((res) => setHealth(res.data));
  }, []);

  const statCards = stats ? [
    {
      label: "Total Backups", value: stats.total_backups.toString(),
      sub: `+${stats.week_backups} this week`,
      icon: Database, border: "border-t-indigo-500", spark: "#6366f1",
    },
    {
      label: "Storage Used", value: formatBytes(stats.storage_used),
      sub: null,
      icon: HardDrive, border: "border-t-violet-500", spark: "#8b5cf6",
    },
    {
      label: "Active Schedules", value: stats.active_schedules.toString(),
      sub: null,
      icon: CalendarClock, border: "border-t-emerald-500", spark: "#10b981",
    },
    {
      label: "Verification Rate", value: `${stats.verification_rate.toFixed(0)}%`,
      sub: null,
      icon: ShieldCheck, border: "border-t-cyan-500", spark: "#06b6d4",
    },
    {
      label: "Anomalies", value: stats.unresolved_anomalies.toString(),
      sub: stats.unresolved_anomalies > 0 ? "unresolved" : "all clear",
      icon: AlertTriangle,
      border: stats.unresolved_anomalies > 0 ? "border-t-red-500" : "border-t-slate-600",
      spark: stats.unresolved_anomalies > 0 ? "#ef4444" : "#475569",
    },
    {
      label: "Last Backup", value: stats.last_backup_status,
      sub: null,
      icon: stats.last_backup_status === "success" ? CheckCircle : XCircle,
      border: stats.last_backup_status === "success" ? "border-t-emerald-500" : "border-t-red-500",
      spark: stats.last_backup_status === "success" ? "#10b981" : "#ef4444",
    },
  ] : [];

  return (
    <div className="space-y-8">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/5 to-transparent" />
        <h1 className="relative text-3xl font-bold text-white">Dashboard</h1>
      </div>

      {/* Stat Cards */}
      {!stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-[#1e293b] p-5"><Skeleton className="h-16 w-full bg-white/5" /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map((card) => (
            <div key={card.label} className={`rounded-xl border border-white/10 border-t-2 ${card.border} bg-[#1e293b] p-4 transition-all hover:border-white/20`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                <card.icon className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <div className="mt-1.5">
                {card.label === "Last Backup" ? (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                    card.value === "success" ? "text-emerald-400" : card.value === "failed" ? "text-red-400" : "text-slate-400"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      card.value === "success" ? "bg-emerald-400" : card.value === "failed" ? "bg-red-400" : "bg-slate-400"
                    }`} />{card.value}
                  </span>
                ) : (
                  <p className="text-xl font-bold text-white">{card.value}</p>
                )}
                {card.sub && <p className="text-[10px] text-slate-500 mt-0.5">{card.sub}</p>}
              </div>
              <Sparkline color={card.spark} />
            </div>
          ))}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Backup Activity Chart */}
        <div className="rounded-xl border border-white/10 bg-[#1e293b] p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Backup Activity — Last 30 Days</h2>
          {chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={1}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="success" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="rounded-xl border border-white/10 bg-[#1e293b] p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">No activity yet</div>
          ) : (
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.status === "success" ? "bg-emerald-400" : a.status === "failed" ? "bg-red-400" : "bg-yellow-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500"> backed up</span>
                      {a.size_bytes > 0 && <span className="text-slate-500"> — {formatBytes(a.size_bytes)}</span>}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0">{relativeTime(a.started_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connections Health Grid */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Connections Health</h2>
        {health.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No connections</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {health.map((h) => (
              <div key={h.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2" title={`${h.name} (${h.type}) — ${h.last_status}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${
                  h.has_anomaly ? "bg-yellow-400 animate-pulse" :
                  h.last_status === "success" ? "bg-emerald-400" :
                  h.last_status === "failed" ? "bg-red-400" :
                  "bg-slate-500"
                }`} />
                <span className="text-xs text-slate-300">{h.name}</span>
                <span className="text-[10px] text-slate-600">{h.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
