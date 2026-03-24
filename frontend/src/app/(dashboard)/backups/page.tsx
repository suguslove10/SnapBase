"use client";

import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, RefreshCw, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface Backup {
  id: number;
  connection_name: string;
  connection_type: string;
  status: string;
  size_bytes: number | null;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  restore_status: string | null;
  verified: boolean | null;
  verification_error: string | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString();
}

function relativeTime(date: string | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return "";
}

function duration(started: string | null, completed: string | null): string {
  if (!started || !completed) return "—";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; pulse?: boolean }> = {
    success: { color: "#00ff88", bg: "rgba(0,255,136,0.10)" },
    failed:  { color: "#f87171", bg: "rgba(248,113,113,0.10)" },
    running: { color: "#fbbf24", bg: "rgba(251,191,36,0.10)", pulse: true },
  };
  const s = map[status] || { color: "#64748b", bg: "rgba(100,116,139,0.10)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 font-jetbrains text-[11px] font-medium" style={{ background: s.bg, color: s.color }}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.pulse ? "animate-pulse" : ""}`} style={{ background: s.color }} />
      {status}
    </span>
  );
}

function VerifiedBadge({ backup, onClickError }: { backup: Backup; onClickError: (msg: string) => void }) {
  if (backup.verified === true)
    return <span className="font-jetbrains text-[11px] text-[#00ff88]">Verified</span>;
  if (backup.verified === false)
    return (
      <button onClick={() => onClickError(backup.verification_error || "Verification failed")}
        className="font-jetbrains text-[11px] text-red-400 underline decoration-dotted hover:text-red-300">
        Failed
      </button>
    );
  if (backup.status === "success")
    return <span className="animate-pulse font-jetbrains text-[11px] text-yellow-400">Verifying</span>;
  return <span className="font-jetbrains text-[11px] text-slate-700">—</span>;
}

const tableCardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
  overflow: "hidden",
};

const dialogStyle = {
  background: "#0d1526",
  border: "1px solid rgba(0,180,255,0.15)",
  borderRadius: "1.25rem",
};

export default function BackupHistoryPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [restoreComplete, setRestoreComplete] = useState<"success" | "error" | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchBackups = () => {
    setLoading(true);
    api.get("/backups").then((res) => { setBackups(res.data); setLoading(false); });
  };

  useEffect(() => { fetchBackups(); }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleDownload = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api"}/backups/${id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "backup.sql.gz";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch { toast.error("Failed to download backup"); }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true); setLogs([]); setRestoreComplete(null);
    const token = localStorage.getItem("token");
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
    try {
      const res = await fetch(`${baseUrl}/backups/${restoreTarget.id}/restore`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setLogs(["Error: No response stream"]); setRestoreComplete("error"); setRestoring(false); return; }
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data:")) setLogs((prev) => [...prev, line.slice(5).trim()]);
          if (line.includes("event:complete")) setRestoreComplete("success");
          if (line.includes("event:error")) setRestoreComplete("error");
        }
      }
    } catch {
      setLogs((prev) => [...prev, "Connection lost"]);
      setRestoreComplete("error");
    }
    setRestoring(false);
    fetchBackups();
  };

  const openRestoreModal = (backup: Backup) => {
    setRestoreTarget(backup); setConfirmed(false);
    setLogs([]); setRestoreComplete(null); setRestoring(false);
  };

  const statusBorderColor: Record<string, string> = {
    success: "rgba(0,255,136,0.3)",
    failed:  "rgba(248,113,113,0.3)",
    running: "rgba(251,191,36,0.3)",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Backup History</h1>
          <p className="mt-1 text-sm text-slate-500">All backup jobs across your connections</p>
        </div>
        <button
          onClick={fetchBackups}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* Table */}
      <div style={tableCardStyle}>
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full bg-white/5" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
              <History className="h-7 w-7 text-slate-600" />
            </div>
            <p className="text-sm text-slate-500">No backups yet.</p>
            <p className="mt-1 text-xs text-slate-600">Trigger a backup from the Connections page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Connection", "Started", "Duration", "Size", "Status", "Verified", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-jetbrains text-[9px] uppercase tracking-widest text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr
                    key={backup.id}
                    className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                    style={{ borderLeft: `2px solid ${statusBorderColor[backup.status] || "transparent"}` }}
                  >
                    <td className="px-4 py-3">
                      <span className="font-grotesk text-sm font-medium text-white">{backup.connection_name}</span>
                      <span className="ml-2 font-jetbrains text-[10px] text-slate-600">{backup.connection_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-400">{formatDate(backup.started_at)}</p>
                      {backup.started_at && <p className="font-jetbrains text-[10px] text-slate-600">{relativeTime(backup.started_at)}</p>}
                    </td>
                    <td className="px-4 py-3 font-jetbrains text-xs text-slate-500">{duration(backup.started_at, backup.completed_at)}</td>
                    <td className="px-4 py-3 font-jetbrains text-xs text-slate-500">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-4 py-3"><StatusBadge status={backup.status} /></td>
                    <td className="px-4 py-3"><VerifiedBadge backup={backup} onClickError={setVerifyError} /></td>
                    <td className="px-4 py-3">
                      {backup.status === "success" ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDownload(backup.id)}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white" title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openRestoreModal(backup)}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-amber-500/10 hover:text-amber-400" title="Restore">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : backup.status === "failed" ? (
                        <span className="font-jetbrains text-[10px] text-red-400/70" title={backup.error_message}>
                          {backup.error_message?.substring(0, 28)}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verification Error Dialog */}
      <Dialog open={!!verifyError} onOpenChange={(o) => !o && setVerifyError(null)}>
        <DialogContent className="max-w-md text-white" style={dialogStyle}>
          <DialogHeader><DialogTitle className="font-grotesk text-base font-semibold text-white">Verification Error</DialogTitle></DialogHeader>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 font-jetbrains text-xs text-red-300 break-all">
            {verifyError}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setVerifyError(null)}
              className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Modal */}
      <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open && !restoring) setRestoreTarget(null); }}>
        <DialogContent className="max-w-lg text-white" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white">
              {restoring || logs.length > 0 ? "Restore Progress" : "Confirm Restore"}
            </DialogTitle>
          </DialogHeader>

          {!restoring && logs.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-300">This will overwrite your database.</p>
                <p className="mt-1 font-jetbrains text-xs text-amber-400/70">
                  Restoring &ldquo;{restoreTarget?.connection_name}&rdquo; from {formatDate(restoreTarget?.started_at || null)}.
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-[#00b4ff]" />
                <span className="text-sm text-slate-300">I understand this will overwrite existing data</span>
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRestoreTarget(null)}
                  className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                  Cancel
                </button>
                <button disabled={!confirmed} onClick={handleRestore}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                  <RotateCcw className="h-3.5 w-3.5" />Restore Now
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div ref={logRef} className="h-64 overflow-y-auto rounded-xl bg-black p-4 font-jetbrains text-xs leading-relaxed">
                {logs.map((log, i) => (
                  <div key={i} className={log.includes("Error") || log.includes("Failed") || log.includes("failed") ? "text-red-400" : "text-[#00ff88]"}>
                    <span className="mr-2 text-slate-700">$</span>{log}
                  </div>
                ))}
                {restoring && <span className="inline-block h-3 w-1.5 animate-pulse bg-[#00ff88]" />}
              </div>
              {restoreComplete && (
                <div className={`rounded-xl border p-3 text-sm font-medium ${
                  restoreComplete === "success"
                    ? "border-[#00ff88]/20 bg-[#00ff88]/10 text-[#00ff88]"
                    : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}>
                  {restoreComplete === "success" ? "Restore completed successfully" : "Restore failed — see logs above"}
                </div>
              )}
              {!restoring && (
                <div className="flex justify-end">
                  <button onClick={() => setRestoreTarget(null)}
                    className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
