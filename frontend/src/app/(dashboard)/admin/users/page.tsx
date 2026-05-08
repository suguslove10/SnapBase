"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle, Database, Users, ArrowUpDown, ArrowLeft } from "lucide-react";
import api from "@/lib/api";

interface AdminUser {
  id: number;
  email: string;
  provider: string;
  created_at: string;
  plan: string;
  sub_status: string;
  trial_ends_at?: string;
  connection_count: number;
  db_types: string[];
  backups_total: number;
  backups_24h: number;
  failures_24h: number;
  last_backup_at?: string;
  last_backup_status?: string;
}

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const planColor: Record<string, string> = {
  free: "#94a3b8",
  trial: "#fbbf24",
  pro: "#00b4ff",
  business: "#a78bfa",
  enterprise: "#00f5d4",
};

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [failingOnly, setFailingOnly] = useState(false);
  const [sort, setSort] = useState("created_desc");

  useEffect(() => {
    const params: Record<string, string> = { sort };
    if (q) params.q = q;
    if (plan) params.plan = plan;
    if (failingOnly) params.failing = "1";
    setUsers(null);
    api.get("/admin/users", { params })
      .then((res) => setUsers(res.data.users || []))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load users"));
  }, [q, plan, failingOnly, sort]);

  const summary = useMemo(() => {
    if (!users) return null;
    const failing = users.filter((u) => u.failures_24h > 0).length;
    const paid = users.filter((u) => u.plan !== "free" && u.sub_status === "active").length;
    const trialing = users.filter((u) => u.sub_status === "trialing").length;
    return { total: users.length, failing, paid, trialing };
  }, [users]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
          {error} — Set <code className="font-jetbrains text-red-200">ADMIN_EMAILS</code> env var to allow your email.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <Link href="/admin" className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" /> Admin metrics
          </Link>
          <h1 className="font-grotesk text-2xl font-bold text-white">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Per-user observability — plans, connections, backup activity.</p>
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard icon={Users} label="Users" value={summary.total} color="#a78bfa" />
          <SummaryCard icon={Database} label="Paid" value={summary.paid} color="#00ff88" />
          <SummaryCard icon={ArrowUpDown} label="Trialing" value={summary.trialing} color="#fbbf24" />
          <SummaryCard icon={AlertTriangle} label="Failing 24h" value={summary.failing} color={summary.failing > 0 ? "#f87171" : "#94a3b8"} />
        </div>
      )}

      <div className="rounded-2xl p-4" style={cardStyle}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-[#00b4ff]/40"
            />
          </div>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#00b4ff]/40"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="trial">Trial</option>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#00b4ff]/40"
          >
            <option value="created_desc">Newest signups</option>
            <option value="created_asc">Oldest signups</option>
            <option value="backups_desc">Most backups</option>
            <option value="failures_desc">Most failures</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={failingOnly}
              onChange={(e) => setFailingOnly(e.target.checked)}
              className="accent-[#00b4ff]"
            />
            Failing 24h only
          </label>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        {!users ? (
          <div className="p-6 text-sm text-slate-500">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No users match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Connections</th>
                <th className="px-4 py-3">DB types</th>
                <th className="px-4 py-3 text-right">Backups (24h)</th>
                <th className="px-4 py-3 text-right">Failures (24h)</th>
                <th className="px-4 py-3">Last backup</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((u) => {
                const failing = u.failures_24h > 0;
                return (
                  <tr key={u.id} className={`transition-colors hover:bg-white/[0.03] ${failing ? "bg-red-500/[0.03]" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="block">
                        <div className="font-medium text-white hover:text-[#00b4ff]">{u.email}</div>
                        <div className="font-jetbrains text-[10px] text-slate-600">{u.provider}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 font-jetbrains text-[10px] font-semibold uppercase"
                        style={{ background: `${planColor[u.plan] ?? "#94a3b8"}20`, color: planColor[u.plan] ?? "#94a3b8" }}
                      >
                        {u.plan}
                      </span>
                      {u.sub_status === "trialing" && (
                        <span className="ml-1 font-jetbrains text-[9px] text-amber-300">trial</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-jetbrains text-slate-300">{u.connection_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.db_types.length === 0 ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          u.db_types.map((t) => (
                            <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-jetbrains text-[9px] text-slate-400">
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-jetbrains text-slate-300">{u.backups_24h}</td>
                    <td className="px-4 py-3 text-right font-jetbrains">
                      {failing ? (
                        <span className="text-red-400">{u.failures_24h}</span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.last_backup_status && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              background:
                                u.last_backup_status === "success" ? "#00ff88" :
                                u.last_backup_status === "failed" ? "#f87171" : "#fbbf24",
                            }}
                          />
                        )}
                        <span className="text-xs text-slate-400">{relTime(u.last_backup_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{relTime(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ ...cardStyle, background: `${color}08`, borderColor: `${color}25` }}>
      <div className="flex items-center justify-between">
        <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-4 w-4" style={{ color, opacity: 0.6 }} />
      </div>
      <p className="mt-2 font-grotesk text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
