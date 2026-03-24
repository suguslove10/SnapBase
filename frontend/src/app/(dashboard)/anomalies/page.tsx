"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface Anomaly {
  id: number;
  connection_id: number;
  connection_name: string;
  backup_job_id: number | null;
  type: string;
  message: string;
  severity: string;
  resolved: boolean;
  created_at: string;
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  borderRadius: "1rem",
};

type Filter = "all" | "unresolved" | "resolved";

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchAnomalies = () => {
    setLoading(true);
    api.get("/anomalies").then((res) => { setAnomalies(res.data); setLoading(false); });
  };

  useEffect(() => { fetchAnomalies(); }, []);

  const handleResolve = async (id: number) => {
    try {
      await api.patch(`/anomalies/${id}/resolve`);
      toast.success("Anomaly resolved");
      fetchAnomalies();
    } catch {
      toast.error("Failed to resolve");
    }
  };

  const filtered = anomalies.filter((a) => {
    if (filter === "unresolved") return !a.resolved;
    if (filter === "resolved") return a.resolved;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Anomalies</h1>
          <p className="mt-1 text-sm text-slate-500">Detected irregularities in your backup jobs</p>
        </div>

        {/* Filter tabs */}
        <div
          className="flex gap-0.5 rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {(["all", "unresolved", "resolved"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-3 py-1.5 font-jetbrains text-xs font-medium transition-all"
              style={
                filter === f
                  ? { background: "rgba(0,180,255,0.15)", color: "#00b4ff" }
                  : { color: "#64748b" }
              }
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-white/5" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <AlertTriangle className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No anomalies detected.</p>
          <p className="mt-1 text-xs text-slate-600">Your backups are running normally.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const isCritical = a.severity === "critical";
            const color = a.resolved ? "#475569" : isCritical ? "#f87171" : "#fbbf24";
            const bg = a.resolved
              ? "rgba(71,85,105,0.08)"
              : isCritical
              ? "rgba(248,113,113,0.06)"
              : "rgba(251,191,36,0.06)";
            const border = a.resolved
              ? "rgba(255,255,255,0.05)"
              : isCritical
              ? "rgba(248,113,113,0.2)"
              : "rgba(251,191,36,0.2)";

            return (
              <div
                key={a.id}
                className={`rounded-2xl p-4 transition-all ${a.resolved ? "opacity-55" : ""}`}
                style={{ background: bg, border: `1px solid ${border}` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${color}18` }}
                    >
                      <AlertTriangle className="h-4 w-4" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{a.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <span className="font-grotesk text-xs text-slate-400">{a.connection_name}</span>
                        <span className="font-jetbrains text-[10px] text-slate-600">{relativeTime(a.created_at)}</span>
                        <span
                          className="rounded-lg px-1.5 py-0.5 font-jetbrains text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: `${color}15`, color }}
                        >
                          {a.severity}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!a.resolved ? (
                    <button
                      onClick={() => handleResolve(a.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00ff88]/30 hover:text-[#00ff88]"
                    >
                      <Check className="h-3 w-3" />
                      Resolve
                    </button>
                  ) : (
                    <span className="font-jetbrains text-[11px] text-slate-600">Resolved</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
