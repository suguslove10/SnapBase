"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Database, Calendar, HardDrive, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import api from "@/lib/api";

interface UserInfo {
  id: number;
  email: string;
  name?: string;
  provider: string;
  created_at: string;
}

interface Subscription {
  plan: string;
  status: string;
  billing_period?: string;
  billing_amount_cents: number;
  trial_ends_at?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
}

interface Connection {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  retention_days: number;
  encrypted: boolean;
  created_at: string;
}

interface BackupRow {
  id: number;
  connection_id: number;
  connection_name: string;
  connection_type: string;
  status: string;
  size_bytes?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

interface Schedule {
  id: number;
  connection_id: number;
  connection_name: string;
  cron_expression: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
}

interface Detail {
  user: UserInfo;
  subscription: Subscription;
  connections: Connection[];
  recent_backups: BackupRow[];
  schedules: Schedule[];
  storage_bytes: number;
}

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

function bytes(n?: number) {
  if (!n || n === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v > 10 ? 0 : 1)} ${units[i]}`;
}

function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const statusColor: Record<string, string> = {
  success: "#00ff88",
  failed: "#f87171",
  running: "#00b4ff",
  pending: "#fbbf24",
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/admin/users/${id}`)
      .then((res) => setD(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load user"));
  }, [id]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">{error}</div>
      </div>
    );
  }
  if (!d) return <div className="p-6 text-sm text-slate-500">Loading user…</div>;

  const failedCount = d.recent_backups.filter((b) => b.status === "failed").length;
  const successCount = d.recent_backups.filter((b) => b.status === "success").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
          <ArrowLeft className="h-3 w-3" /> All users
        </Link>
        <h1 className="font-grotesk text-2xl font-bold text-white">{d.user.email}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {d.user.name && <span className="mr-2">{d.user.name}</span>}
          <span className="font-jetbrains text-xs">via {d.user.provider}</span>
          <span className="mx-2">·</span>
          Joined {new Date(d.user.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Database} label="Connections" value={d.connections.length.toString()} color="#00b4ff" />
        <Stat icon={Calendar} label="Schedules" value={d.schedules.filter((s) => s.enabled).length.toString()} sub={`${d.schedules.length} total`} color="#a78bfa" />
        <Stat icon={HardDrive} label="Storage used" value={bytes(d.storage_bytes)} color="#00f5d4" />
        <Stat
          icon={failedCount > 0 ? AlertCircle : CheckCircle2}
          label="Last 50 backups"
          value={`${successCount}/${d.recent_backups.length}`}
          sub={failedCount > 0 ? `${failedCount} failed` : "all success"}
          color={failedCount > 0 ? "#f87171" : "#00ff88"}
        />
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="mb-3 font-grotesk text-sm font-semibold text-white">Subscription</h2>
        <div className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2 md:grid-cols-3">
          <Row label="Plan" value={<span className="capitalize text-white">{d.subscription.plan}</span>} />
          <Row label="Status" value={<span className="text-white">{d.subscription.status}</span>} />
          {d.subscription.billing_period && (
            <Row label="Billing" value={`${d.subscription.billing_period} · $${(d.subscription.billing_amount_cents / 100).toFixed(0)}`} />
          )}
          {d.subscription.trial_ends_at && (
            <Row label="Trial ends" value={new Date(d.subscription.trial_ends_at).toLocaleDateString()} />
          )}
          {d.subscription.current_period_end && (
            <Row label="Period ends" value={new Date(d.subscription.current_period_end).toLocaleDateString()} />
          )}
          {d.subscription.cancel_at_period_end && (
            <Row label="Cancellation" value={<span className="text-amber-300">scheduled</span>} />
          )}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="mb-3 font-grotesk text-sm font-semibold text-white">Connections</h2>
        {d.connections.length === 0 ? (
          <p className="text-xs text-slate-600">No connections.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2">Name</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Host</th>
                <th className="pb-2">Database</th>
                <th className="pb-2 text-right">Retention</th>
                <th className="pb-2">Encryption</th>
                <th className="pb-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {d.connections.map((c) => (
                <tr key={c.id} className="text-slate-300">
                  <td className="py-2 text-white">{c.name}</td>
                  <td className="py-2 font-jetbrains text-xs">{c.type}</td>
                  <td className="py-2 font-jetbrains text-xs text-slate-500">
                    {c.host || "—"}{c.port ? `:${c.port}` : ""}
                  </td>
                  <td className="py-2 font-jetbrains text-xs">{c.database}</td>
                  <td className="py-2 text-right text-xs">{c.retention_days}d</td>
                  <td className="py-2 text-xs">
                    {c.encrypted ? <span className="text-[#00ff88]">on</span> : <span className="text-slate-600">off</span>}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{relTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-grotesk text-sm font-semibold text-white">Recent backups</h2>
          <span className="font-jetbrains text-[10px] text-slate-600">last 50</span>
        </div>
        {d.recent_backups.length === 0 ? (
          <p className="text-xs text-slate-600">No backups yet.</p>
        ) : (
          <div className="space-y-2">
            {d.recent_backups.map((b) => (
              <div
                key={b.id}
                className={`rounded-lg border p-3 ${b.status === "failed" ? "border-red-500/20 bg-red-500/[0.04]" : "border-white/[0.04] bg-white/[0.02]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: statusColor[b.status] ?? "#94a3b8" }}
                    />
                    <span className="text-sm font-medium text-white">{b.connection_name}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-jetbrains text-[10px] text-slate-400">{b.connection_type}</span>
                    <span className="font-jetbrains text-[10px] uppercase" style={{ color: statusColor[b.status] ?? "#94a3b8" }}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {b.size_bytes && <span className="font-jetbrains">{bytes(b.size_bytes)}</span>}
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {relTime(b.started_at)}</span>
                  </div>
                </div>
                {b.error_message && (
                  <div className="mt-2 rounded bg-black/30 p-2 font-jetbrains text-[11px] text-red-300">
                    {b.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="mb-3 font-grotesk text-sm font-semibold text-white">Schedules</h2>
        {d.schedules.length === 0 ? (
          <p className="text-xs text-slate-600">No schedules.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2">Connection</th>
                <th className="pb-2">Cron</th>
                <th className="pb-2">Enabled</th>
                <th className="pb-2">Last run</th>
                <th className="pb-2">Next run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {d.schedules.map((s) => (
                <tr key={s.id} className="text-slate-300">
                  <td className="py-2 text-white">{s.connection_name}</td>
                  <td className="py-2 font-jetbrains text-xs">{s.cron_expression}</td>
                  <td className="py-2 text-xs">
                    {s.enabled ? <span className="text-[#00ff88]">yes</span> : <span className="text-slate-600">no</span>}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{relTime(s.last_run)}</td>
                  <td className="py-2 text-xs text-slate-500">{relTime(s.next_run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ ...cardStyle, background: `${color}08`, borderColor: `${color}25` }}>
      <div className="flex items-center justify-between">
        <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-4 w-4" style={{ color, opacity: 0.6 }} />
      </div>
      <p className="mt-2 font-grotesk text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 font-jetbrains text-[11px]" style={{ color, opacity: 0.7 }}>{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-jetbrains text-slate-300">{value}</span>
    </div>
  );
}
