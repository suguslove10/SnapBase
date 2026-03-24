"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");

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
    } catch { toast.error("Failed to resolve"); }
  };

  const filtered = anomalies.filter((a) => {
    if (filter === "unresolved") return !a.resolved;
    if (filter === "resolved") return a.resolved;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-red-500/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Anomalies</h1>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {(["all", "unresolved", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  filter === f ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-white/5 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#1e293b] py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <AlertTriangle className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No anomalies detected.</p>
          <p className="mt-1 text-xs text-slate-600">Your backups are running normally.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border bg-[#1e293b] p-4 transition ${
                a.resolved
                  ? "border-white/[0.06] opacity-60"
                  : a.severity === "critical"
                  ? "border-red-500/20"
                  : "border-amber-500/20"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    a.severity === "critical" ? "bg-red-500/10" : "bg-amber-500/10"
                  }`}>
                    <AlertTriangle className={`h-4 w-4 ${
                      a.severity === "critical" ? "text-red-400" : "text-amber-400"
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{a.message}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>{a.connection_name}</span>
                      <span>{relativeTime(a.created_at)}</span>
                      <span className={`uppercase tracking-wider font-medium ${
                        a.severity === "critical" ? "text-red-400" : "text-amber-400"
                      }`}>{a.severity}</span>
                    </div>
                  </div>
                </div>
                {!a.resolved && (
                  <Button size="sm" variant="outline" onClick={() => handleResolve(a.id)} className="shrink-0 border-white/10 bg-white/[0.03] text-slate-400 hover:text-white text-xs h-7">
                    <Check className="mr-1 h-3 w-3" />Resolve
                  </Button>
                )}
                {a.resolved && (
                  <span className="text-[11px] text-slate-600">Resolved</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
