"use client";

import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, RefreshCw, History, RotateCcw, Terminal, Zap, Copy, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface Backup {
  id: number;
  connection_name: string;
  connection_type: string;
  connection_host: string;
  connection_port: number;
  connection_database: string;
  connection_username: string;
  status: string;
  size_bytes: number | null;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  restore_status: string | null;
  encrypted: boolean;
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

function buildCliCommands(backup: Backup): { label: string; commands: string }[] {
  const h = backup.connection_host || "<HOST>";
  const p = backup.connection_port || "<PORT>";
  const db = backup.connection_database || "<DATABASE>";
  const u = backup.connection_username || "<USER>";

  switch (backup.connection_type) {
    case "postgres":
      return [
        {
          label: "1. Download the backup file",
          commands: `# Using the Download button above, or via curl:\ncurl -H "Authorization: Bearer <TOKEN>" \\\n  "${process.env.NEXT_PUBLIC_API_URL || "https://api.getsnapbase.com/api"}/backups/${backup.id}/download" \\\n  -o backup.sql.gz`,
        },
        {
          label: "2. Decompress",
          commands: `gunzip backup.sql.gz`,
        },
        {
          label: "3. Restore with pg_restore",
          commands: `pg_restore \\\n  -h ${h} \\\n  -p ${p} \\\n  -U ${u} \\\n  -d ${db} \\\n  --no-owner --no-acl \\\n  backup.sql`,
        },
      ];
    case "mysql":
      return [
        {
          label: "1. Download the backup file",
          commands: `curl -H "Authorization: Bearer <TOKEN>" \\\n  "${process.env.NEXT_PUBLIC_API_URL || "https://api.getsnapbase.com/api"}/backups/${backup.id}/download" \\\n  -o backup.sql.gz`,
        },
        {
          label: "2. Decompress & restore",
          commands: `gunzip -c backup.sql.gz | mysql \\\n  -h ${h} \\\n  -P ${p} \\\n  -u ${u} \\\n  -p \\\n  ${db}`,
        },
      ];
    case "mongodb":
      return [
        {
          label: "1. Download the backup file",
          commands: `curl -H "Authorization: Bearer <TOKEN>" \\\n  "${process.env.NEXT_PUBLIC_API_URL || "https://api.getsnapbase.com/api"}/backups/${backup.id}/download" \\\n  -o backup.gz`,
        },
        {
          label: "2. Restore with mongorestore",
          commands: `mongorestore \\\n  --uri="mongodb://${u}:<PASS>@${h}:${p}/${db}" \\\n  --archive=backup.gz \\\n  --gzip \\\n  --drop`,
        },
      ];
    default:
      return [
        {
          label: "Download",
          commands: `# Download via the Download button, then restore manually.`,
        },
      ];
  }
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative rounded-xl bg-black/60 p-4">
      <pre className="overflow-x-auto font-jetbrains text-xs leading-relaxed text-[#00ff88] whitespace-pre-wrap break-all">{code}</pre>
      <button
        onClick={copy}
        className="absolute right-3 top-3 rounded-lg p-1 text-slate-600 opacity-0 transition hover:text-slate-300 group-hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[#00ff88]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
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
  const [restoreTab, setRestoreTab] = useState<"auto" | "cli">("auto");
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
    setRestoreTarget(backup);
    setRestoreTab("auto");
    setConfirmed(false);
    setLogs([]);
    setRestoreComplete(null);
    setRestoring(false);
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
                      <div className="flex items-center gap-2">
                        <span className="font-grotesk text-sm font-medium text-white">{backup.connection_name}</span>
                        <span className="font-jetbrains text-[10px] text-slate-600">{backup.connection_type}</span>
                        {backup.encrypted && (
                          <span title="AES-256 encrypted" className="flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5">
                            <Lock className="h-2.5 w-2.5 text-emerald-400" />
                            <span className="font-jetbrains text-[9px] text-emerald-400">AES-256</span>
                          </span>
                        )}
                      </div>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(backup.id)}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openRestoreModal(backup)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Restore
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
        <DialogContent className="max-w-xl text-white" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white">
              Restore — {restoreTarget?.connection_name}
            </DialogTitle>
            <p className="text-xs text-slate-500">{formatDate(restoreTarget?.started_at || null)}</p>
          </DialogHeader>

          {/* Tabs — only show when not mid-restore */}
          {!restoring && logs.length === 0 && (
            <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
              <button
                onClick={() => setRestoreTab("auto")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${restoreTab === "auto" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                style={restoreTab === "auto" ? { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)" } : undefined}
              >
                <Zap className="h-3.5 w-3.5" />
                1-Click Restore
              </button>
              <button
                onClick={() => setRestoreTab("cli")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${restoreTab === "cli" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                style={restoreTab === "cli" ? { background: "rgba(0,180,255,0.10)", border: "1px solid rgba(0,180,255,0.20)" } : undefined}
              >
                <Terminal className="h-3.5 w-3.5" />
                CLI Commands
              </button>
            </div>
          )}

          {/* 1-Click Restore tab */}
          {restoreTab === "auto" && !restoring && logs.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-300">This will overwrite your live database.</p>
                <p className="mt-1 font-jetbrains text-xs text-amber-400/70">
                  SnapBase will download the backup and run {
                    restoreTarget?.connection_type === "postgres" ? "pg_restore" :
                    restoreTarget?.connection_type === "mysql" ? "mysql" :
                    restoreTarget?.connection_type === "mongodb" ? "mongorestore" : "restore"
                  } directly against <strong className="text-amber-300">{restoreTarget?.connection_database || restoreTarget?.connection_name}</strong>.
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
                  className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#0a0f1e" }}>
                  <RotateCcw className="h-3.5 w-3.5" />Restore Now
                </button>
              </div>
            </div>
          )}

          {/* CLI Commands tab */}
          {restoreTab === "cli" && !restoring && logs.length === 0 && restoreTarget && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <p className="text-xs text-slate-400">
                Run these commands on any machine with the database CLI tools installed.
              </p>
              {restoreTarget.encrypted && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-300 font-medium">This backup is AES-256 encrypted</p>
                  </div>
                  <p className="mt-1.5 font-jetbrains text-[10px] text-emerald-400/70">
                    Download the <code>.gz.enc</code> file, then decrypt it first:
                  </p>
                  <div className="mt-2 rounded-lg bg-black/40 p-2.5 font-jetbrains text-[11px] text-emerald-300">
                    {`# Using openssl to decrypt (you'll need your backup password):\nopenssl enc -d -aes-256-gcm -in backup.gz.enc -out backup.gz`}
                  </div>
                  <p className="mt-1.5 font-jetbrains text-[10px] text-emerald-400/70">
                    Or use the 1-Click Restore tab — SnapBase decrypts automatically.
                  </p>
                </div>
              )}
              {buildCliCommands(restoreTarget).map((step) => (
                <div key={step.label} className="space-y-1.5">
                  <p className="font-jetbrains text-[10px] uppercase tracking-wider text-slate-500">{step.label}</p>
                  <CodeBlock code={step.commands} />
                </div>
              ))}
              <div className="rounded-xl border border-[#00b4ff]/10 bg-[#00b4ff]/5 p-3 text-xs text-slate-400">
                Replace <code className="font-jetbrains text-[#00b4ff]">&lt;TOKEN&gt;</code> with your JWT from localStorage, and <code className="font-jetbrains text-[#00b4ff]">&lt;PASS&gt;</code> with your database password from Settings → Connections.
              </div>
              <div className="flex justify-end">
                <button onClick={() => setRestoreTarget(null)}
                  className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Live restore log */}
          {(restoring || logs.length > 0) && (
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
