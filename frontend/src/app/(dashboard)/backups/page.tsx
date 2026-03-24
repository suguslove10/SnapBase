"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  if (!bytes) return "-";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: string | null): string {
  if (!date) return "-";
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

function statusIndicator(status: string) {
  switch (status) {
    case "success": return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />success</span>;
    case "failed": return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />failed</span>;
    case "running": return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400"><span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />running</span>;
    default: return <span className="text-xs text-slate-500">{status}</span>;
  }
}

function verifiedBadge(backup: Backup, onClickError: (msg: string) => void) {
  if (backup.verified === true) return <span className="text-xs text-emerald-400">Verified</span>;
  if (backup.verified === false) return (
    <button onClick={() => onClickError(backup.verification_error || "Verification failed")}
      className="text-xs text-red-400 underline decoration-dotted hover:text-red-300 cursor-pointer">
      Failed
    </button>
  );
  if (backup.status === "success") return <span className="text-xs text-yellow-400 animate-pulse">Verifying</span>;
  return <span className="text-xs text-slate-600">-</span>;
}

const statusBorderColor: Record<string, string> = {
  success: "border-l-emerald-500/50",
  failed: "border-l-red-500/50",
  running: "border-l-yellow-500/50",
};

function duration(started: string | null, completed: string | null): string {
  if (!started || !completed) return "-";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

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
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch { toast.error("Failed to download backup"); }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setLogs([]);
    setRestoreComplete(null);

    const token = localStorage.getItem("token");
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

    try {
      const res = await fetch(`${baseUrl}/backups/${restoreTarget.id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setLogs((prev) => [...prev, "Error: No response stream"]);
        setRestoreComplete("error");
        setRestoring(false);
        return;
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const msg = line.slice(5).trim();
            setLogs((prev) => [...prev, msg]);
          }
          if (line.startsWith("event:complete") || line.includes("event:complete")) {
            setRestoreComplete("success");
          }
          if (line.startsWith("event:error") || line.includes("event:error")) {
            setRestoreComplete("error");
          }
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
    setRestoreTarget(backup);
    setConfirmed(false);
    setLogs([]);
    setRestoreComplete(null);
    setRestoring(false);
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-violet-500/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Backup History</h1>
          <Button variant="outline" onClick={fetchBackups} size="sm" className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1e293b]">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full bg-white/5" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
              <History className="h-7 w-7 text-slate-600" />
            </div>
            <p className="text-sm text-slate-500">No backups yet.</p>
            <p className="mt-1 text-xs text-slate-600">Trigger a backup from the Connections page.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Connection</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Started</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Duration</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Size</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Verified</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id} className={`border-white/[0.04] border-l-2 ${statusBorderColor[backup.status] || "border-l-transparent"} hover:bg-white/[0.02]`}>
                  <TableCell>
                    <span className="font-medium text-white">{backup.connection_name}</span>
                    <span className="ml-2 text-[11px] text-slate-500">{backup.connection_type}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm text-slate-400">{formatDate(backup.started_at)}</p>
                      {backup.started_at && <p className="text-[11px] text-slate-600">{relativeTime(backup.started_at)}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">{duration(backup.started_at, backup.completed_at)}</TableCell>
                  <TableCell className="text-slate-400 text-sm">{formatBytes(backup.size_bytes)}</TableCell>
                  <TableCell>{statusIndicator(backup.status)}</TableCell>
                  <TableCell>{verifiedBadge(backup, setVerifyError)}</TableCell>
                  <TableCell className="text-right">
                    {backup.status === "success" ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(backup.id)} className="text-slate-400 hover:text-white h-7 text-xs px-2">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openRestoreModal(backup)} className="text-slate-400 hover:text-amber-400 h-7 text-xs px-2">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : backup.status === "failed" ? (
                      <span className="text-[11px] text-red-400/70" title={backup.error_message}>{backup.error_message?.substring(0, 30)}</span>
                    ) : <span className="text-slate-600">-</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Verification Error Dialog */}
      <Dialog open={!!verifyError} onOpenChange={(o) => !o && setVerifyError(null)}>
        <DialogContent className="border-white/10 bg-[#1e293b] text-white max-w-md">
          <DialogHeader><DialogTitle>Verification Error</DialogTitle></DialogHeader>
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 font-mono text-xs text-red-300 break-all">
            {verifyError}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setVerifyError(null)} className="border-white/10 text-slate-400">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Modal */}
      <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open && !restoring) setRestoreTarget(null); }}>
        <DialogContent className="border-white/10 bg-[#1e293b] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {restoring || logs.length > 0 ? "Restore Progress" : "Confirm Restore"}
            </DialogTitle>
          </DialogHeader>

          {!restoring && logs.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm text-amber-300 font-medium">This will overwrite your database.</p>
                <p className="mt-1 text-xs text-amber-400/70">
                  Restoring &ldquo;{restoreTarget?.connection_name}&rdquo; from backup taken {formatDate(restoreTarget?.started_at || null)}.
                </p>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-indigo-500"
                />
                <span className="text-sm text-slate-300">I understand this will overwrite existing data</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setRestoreTarget(null)} className="border-white/10 text-slate-400">
                  Cancel
                </Button>
                <Button size="sm" disabled={!confirmed} onClick={handleRestore} className="bg-amber-600 hover:bg-amber-500 text-white">
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore Now
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div ref={logRef} className="h-64 overflow-y-auto rounded-lg bg-black p-4 font-mono text-xs leading-relaxed">
                {logs.map((log, i) => (
                  <div key={i} className={log.includes("Error") || log.includes("Failed") || log.includes("failed") ? "text-red-400" : "text-emerald-400"}>
                    <span className="text-slate-600 mr-2">$</span>{log}
                  </div>
                ))}
                {restoring && <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-400" />}
              </div>
              {restoreComplete && (
                <div className={`rounded-lg p-3 text-sm font-medium ${
                  restoreComplete === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {restoreComplete === "success" ? "Restore completed successfully" : "Restore failed — see logs above"}
                </div>
              )}
              {!restoring && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setRestoreTarget(null)} className="border-white/10 text-slate-400">
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
