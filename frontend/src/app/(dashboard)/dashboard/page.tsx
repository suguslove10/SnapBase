"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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

interface Usage {
  storage_used_bytes: number;
  storage_used_formatted: string;
  storage_limit_bytes: number;
  storage_limit_formatted: string;
  storage_percentage: number;
  connections_used: number;
  connections_limit: number;
  plan: string;
}

interface ChartPoint { day: string; success: number; failed: number; }
interface Activity { id: number; name: string; type: string; status: string; size_bytes: number; started_at: string; }
interface ConnHealth {
  connection_id: number;
  connection_name: string;
  score: number;
  grade: string;
  status: string;
  factors: {
    last_backup_success: boolean;
    last_backup_points: number;
    verified: boolean;
    verification_points: number;
    backed_up_recently: boolean;
    recency_points: number;
    no_anomalies: boolean;
    anomaly_points: number;
    has_schedule: boolean;
    schedule_points: number;
  };
  last_backup_at: string | null;
  next_backup_at: string | null;
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

function Sparkline({ color, values }: { color: string; values: number[] }) {
  if (!values.length) {
    return <div className="mt-2 h-[18px] w-20 opacity-20" />;
  }
  const w = 80, h = 18;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2 opacity-50">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#00ff88";
    case "B": return "#00b4ff";
    case "C": return "#f59e0b";
    case "D": return "#f97316";
    default:   return "#ef4444";
  }
}

function CircleRing({ score, grade }: { score: number; grade: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(score / 100, 1));
  const color = gradeColor(grade);
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">{score}</text>
    </svg>
  );
}

function storageBarColor(pct: number): string {
  if (pct > 90) return "#ef4444";
  if (pct > 70) return "#f59e0b";
  return "#00ff88";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [health, setHealth] = useState<ConnHealth[]>([]);
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    api.get("/backups/stats").then((res) => setStats(res.data));
    api.get("/billing/usage").then((res) => setUsage(res.data)).catch(() => {});
    api.get("/backups/chart").then((res) => setChartData(res.data));
    api.get("/backups/activity").then((res) => setActivity(res.data));
    api.get("/connections/health").then((res) => setHealth(res.data));
    if (searchParams.get("upgraded") === "true") {
      setShowUpgradeToast(true);
      setTimeout(() => setShowUpgradeToast(false), 5000);
    }
  }, [searchParams]);

  // Derive sparkline series from real chartData (last 14 days where available).
  const successSeries = chartData.slice(-14).map((d) => d.success);
  const totalSeries = chartData.slice(-14).map((d) => d.success + d.failed);
  const failedSeries = chartData.slice(-14).map((d) => d.failed);

  const statCards = stats ? [
    {
      label: "Total Backups",
      value: stats.total_backups.toString(),
      sub: `+${stats.week_backups} this week`,
      icon: Database,
      color: "#00b4ff",
      bg: "rgba(0,180,255,0.08)",
      series: totalSeries,
    },
    {
      label: "Active Schedules",
      value: stats.active_schedules.toString(),
      sub: null,
      icon: CalendarClock,
      color: "#00ff88",
      bg: "rgba(0,255,136,0.08)",
      series: successSeries,
    },
    {
      label: "Verification Rate",
      value: `${stats.verification_rate.toFixed(0)}%`,
      sub: null,
      icon: ShieldCheck,
      color: "#00b4ff",
      bg: "rgba(0,180,255,0.08)",
      series: successSeries,
    },
    {
      label: "Anomalies",
      value: stats.unresolved_anomalies.toString(),
      sub: stats.unresolved_anomalies > 0 ? "unresolved" : "all clear",
      icon: AlertTriangle,
      color: stats.unresolved_anomalies > 0 ? "#f87171" : "#00ff88",
      bg: stats.unresolved_anomalies > 0 ? "rgba(248,113,113,0.08)" : "rgba(0,255,136,0.08)",
      series: failedSeries,
    },
    {
      label: "Last Backup",
      value: stats.last_backup_status,
      sub: null,
      icon: stats.last_backup_status === "success" ? CheckCircle : XCircle,
      color: stats.last_backup_status === "success" ? "#00ff88" : "#f87171",
      bg: stats.last_backup_status === "success" ? "rgba(0,255,136,0.08)" : "rgba(248,113,113,0.08)",
      series: successSeries,
    },
  ] : [];

  const cardStyle = {
    background: "rgba(13,21,38,0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "1rem",
  };

  const storagePct = usage?.storage_percentage ?? 0;
  const barColor = storageBarColor(storagePct);

  // Health overview counts
  const healthyCnt = health.filter(h => h.score >= 80).length;
  const warningCnt = health.filter(h => h.score >= 60 && h.score < 80).length;
  const criticalCnt = health.filter(h => h.score < 60).length;
  const criticalConns = health.filter(h => h.score < 50);

  return (
    <div className="space-y-8">
      {/* Upgrade success toast */}
      {showUpgradeToast && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl border border-[#00ff88]/20 bg-[#00ff88]/10 px-5 py-4 shadow-lg">
          <CheckCircle className="h-5 w-5 text-[#00ff88]" />
          <div>
            <p className="font-grotesk text-sm font-semibold text-white">Plan upgraded!</p>
            <p className="text-xs text-slate-400">Your new plan is now active.</p>
          </div>
        </div>
      )}

      {/* Critical connection alerts */}
      {criticalConns.map((conn) => (
        <div
          key={conn.connection_id}
          className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
        >
          <span className="text-base">🚨</span>
          <p className="flex-1 text-sm text-red-300">
            <span className="font-semibold">{conn.connection_name}</span> needs attention — health score{" "}
            <span className="font-mono">{conn.score}/100</span>
          </p>
        </div>
      ))}

      {/* Storage warning banners */}
      {usage && usage.storage_percentage > 95 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <span className="text-base">🚨</span>
          <p className="flex-1 text-sm text-red-300">
            Storage almost full! New backups may fail.{" "}
            <a href="/billing" className="font-semibold underline">Upgrade now.</a>
          </p>
        </div>
      )}
      {usage && usage.storage_percentage > 80 && usage.storage_percentage <= 95 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <span className="text-base">⚠️</span>
          <p className="flex-1 text-sm text-amber-300">
            You&apos;ve used {usage.storage_percentage.toFixed(0)}% of your storage quota.{" "}
            <a href="/billing" className="font-semibold underline">Upgrade to get more storage.</a>
          </p>
        </div>
      )}

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
          {/* Storage card — custom with progress bar */}
          <div
            className="group rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5"
            style={{ ...cardStyle, background: "rgba(0,245,212,0.08)", borderColor: "#00f5d422" }}
          >
            <div className="flex items-start justify-between">
              <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-500">Storage Used</p>
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-[#00f5d4] opacity-60" />
            </div>
            <div className="mt-2">
              {usage ? (
                <>
                  <p className="font-grotesk text-sm font-bold text-white leading-tight">
                    {usage.storage_used_formatted}
                    <span className="font-normal text-slate-500 text-[10px]"> / {usage.storage_limit_formatted}</span>
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(storagePct, 100)}%`, background: barColor }}
                    />
                  </div>
                  <p className="mt-1 font-jetbrains text-[9px]" style={{ color: barColor, opacity: 0.8 }}>
                    {storagePct < 0.01 ? "< 0.01" : storagePct.toFixed(2)}% used
                  </p>
                </>
              ) : (
                <p className="font-grotesk text-xl font-bold text-white">{formatBytes(stats.storage_used)}</p>
              )}
            </div>
          </div>

          {/* Regular stat cards */}
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
              <Sparkline color={card.color} values={card.series} />
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-grotesk text-sm font-semibold text-white">Connections Health</h2>
          {health.length > 0 && (
            <div className="flex items-center gap-3 font-jetbrains text-[10px]">
              {healthyCnt > 0 && (
                <span className="flex items-center gap-1 text-[#00ff88]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00ff88]" />{healthyCnt} healthy
                </span>
              )}
              {warningCnt > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{warningCnt} warning
                </span>
              )}
              {criticalCnt > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />{criticalCnt} critical
                </span>
              )}
            </div>
          )}
        </div>
        {health.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">No connections yet</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {health.map((h) => {
              const color = gradeColor(h.grade);
              return (
                <div
                  key={h.connection_id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/10"
                >
                  <CircleRing score={h.score} grade={h.grade} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-grotesk text-xs font-semibold text-white">{h.connection_name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 font-jetbrains text-[9px] font-bold"
                        style={{ background: `${color}20`, color }}
                      >
                        {h.grade}
                      </span>
                      <span className={`font-jetbrains text-[9px] ${
                        h.status === "healthy" ? "text-[#00ff88]" :
                        h.status === "warning" ? "text-amber-400" : "text-red-400"
                      }`}>{h.status}</span>
                    </div>
                    {h.last_backup_at && (
                      <p className="mt-0.5 font-jetbrains text-[9px] text-slate-600">
                        {relativeTime(h.last_backup_at)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
