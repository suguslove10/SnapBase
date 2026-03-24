"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, HardDrive, CalendarClock, CheckCircle,
  XCircle, ShieldCheck, AlertTriangle,
} from "lucide-react";
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

interface ChartPoint { day: string; success: number; failed: number; }
interface Activity { id: number; name: string; type: string; status: string; size_bytes: number; started_at: string; }
interface ConnHealth { id: number; name: string; type: string; last_status: string; has_anomaly: boolean; }

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
    <svg width="80" height="18" viewBox="0 0 80 18" className="mt-2 opacity-40">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        points="0,15 10,12 20,14 30,9 40,11 50,5 60,7 70,2 80,4" />
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
      label: "Total Backups",
      value: stats.total_backups.toString(),
      sub: `+${stats.week_backups} this week`,
      icon: Database,
      color: "#00b4ff",
      bg: "rgba(0,180,255,0.08)",
    },
    {
      label: "Storage Used",
      value: formatBytes(stats.storage_used),
      sub: null,
      icon: HardDrive,
      color: "#00f5d4",
      bg: "rgba(0,245,212,0.08)",
    },
    {
      label: "Active Schedules",
      value: stats.active_schedules.toString(),
      sub: null,
      icon: CalendarClock,
      color: "#00ff88",
      bg: "rgba(0,255,136,0.08)",
    },
    {
      label: "Verification Rate",
      value: `${stats.verification_rate.toFixed(0)}%`,
      sub: null,
      icon: ShieldCheck,
      color: "#00b4ff",
      bg: "rgba(0,180,255,0.08)",
    },
    {
      label: "Anomalies",
      value: stats.unresolved_anomalies.toString(),
      sub: stats.unresolved_anomalies > 0 ? "unresolved" : "all clear",
      icon: AlertTriangle,
      color: stats.unresolved_anomalies > 0 ? "#f87171" : "#00ff88",
      bg: stats.unresolved_anomalies > 0 ? "rgba(248,113,113,0.08)" : "rgba(0,255,136,0.08)",
    },
    {
      label: "Last Backup",
      value: stats.last_backup_status,
      sub: null,
      icon: stats.last_backup_status === "success" ? CheckCircle : XCircle,
      color: stats.last_backup_status === "success" ? "#00ff88" : "#f87171",
      bg: stats.last_backup_status === "success" ? "rgba(0,255,136,0.08)" : "rgba(248,113,113,0.08)",
    },
  ] : [];

  const cardStyle = {
    background: "rgba(13,21,38,0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "1rem",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-grotesk text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back. Here&apos;s your backup overview.</p>
      </div>

      {/* Stat Cards */}
      {!stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl p-5" style={cardStyle}>
              <Skeleton className="h-16 w-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="group rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{ ...cardStyle, background: card.bg, borderColor: `${card.color}22` }}
            >
              <div className="flex items-start justify-between">
                <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-500">{card.label}</p>
                <card.icon className="h-3.5 w-3.5 shrink-0" style={{ color: card.color, opacity: 0.6 }} />
              </div>
              <div className="mt-2">
                {card.label === "Last Backup" ? (
                  <span className="inline-flex items-center gap-1.5 font-grotesk text-sm font-semibold" style={{ color: card.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: card.color }} />
                    {card.value}
                  </span>
                ) : (
                  <p className="font-grotesk text-xl font-bold text-white">{card.value}</p>
                )}
                {card.sub && (
                  <p className="mt-0.5 font-jetbrains text-[10px]" style={{ color: card.color, opacity: 0.7 }}>{card.sub}</p>
                )}
              </div>
              <Sparkline color={card.color} />
            </div>
          ))}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Backup Activity Chart */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="mb-4 font-grotesk text-sm font-semibold text-white">
            Backup Activity{" "}
            <span className="font-jetbrains font-normal text-slate-600">— last 30 days</span>
          </h2>
          {chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-600">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={1}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "#475569", fontFamily: "var(--font-mono)" }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#475569", fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1526",
                    border: "1px solid rgba(0,180,255,0.15)",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: "#94a3b8" }}
                  cursor={{ fill: "rgba(0,180,255,0.04)" }}
                />
                <Bar dataKey="success" fill="#00ff88" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" fill="#f87171" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="mb-4 font-grotesk text-sm font-semibold text-white">Recent Activity</h2>
          {activity.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-600">No activity yet</div>
          ) : (
            <div className="space-y-1">
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/[0.03]"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.status === "success" ? "bg-[#00ff88]" :
                    a.status === "failed" ? "bg-red-400" : "bg-yellow-400 animate-pulse"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500"> · {a.type}</span>
                      {a.size_bytes > 0 && (
                        <span className="font-jetbrains text-slate-600"> {formatBytes(a.size_bytes)}</span>
                      )}
                    </p>
                  </div>
                  <span className="font-jetbrains text-[10px] text-slate-600 shrink-0">{relativeTime(a.started_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connections Health */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="mb-4 font-grotesk text-sm font-semibold text-white">Connections Health</h2>
        {health.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">No connections yet</div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {health.map((h) => (
              <div
                key={h.id}
                title={`${h.name} (${h.type}) — ${h.last_status}`}
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition hover:border-white/10"
              >
                <span className={`h-2 w-2 rounded-full ${
                  h.has_anomaly ? "bg-yellow-400 animate-pulse" :
                  h.last_status === "success" ? "bg-[#00ff88]" :
                  h.last_status === "failed" ? "bg-red-400" : "bg-slate-500"
                }`} />
                <span className="font-grotesk text-xs font-medium text-slate-300">{h.name}</span>
                <span className="font-jetbrains text-[10px] text-slate-600">{h.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
