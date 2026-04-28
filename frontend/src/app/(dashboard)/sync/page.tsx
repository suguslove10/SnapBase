"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Play,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import UpgradeModal from "@/components/UpgradeModal";
import Link from "next/link";

interface Connection {
  id: number;
  name: string;
  type: string;
}

interface SyncJob {
  id: number;
  name: string;
  source_connection_id: number;
  target_connection_id: number;
  source_connection_name: string;
  target_connection_name: string;
  source_type: string;
  target_type: string;
  schedule: string;
  status: string;
  last_run_at: string | null;
  last_run_status: string;
  enabled: boolean;
  created_at: string;
}

interface SyncRun {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string;
  backup_job_id: number | null;
}

const CRON_PRESETS = [
  { label: "Every hour",    value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 2am",  value: "0 2 * * *" },
  { label: "Weekly (Mon)",  value: "0 2 * * 1" },
  { label: "Custom",        value: "custom" },
];

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const inputClass =
  "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#6366f1]/50";

function formatRelative(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString();
}

function cronHuman(expr: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === expr);
  return preset ? preset.label : expr;
}

const dbColors: Record<string, string> = {
  postgres: "#00b4ff",
  mysql: "#ff9500",
  mongodb: "#00ff88",
  sqlite: "#94a3b8",
};

export default function SyncPage() {
  const { plan } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SyncJob | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());
  const [runsMap, setRunsMap] = useState<Record<number, SyncRun[]>>({});

  const [form, setForm] = useState({
    name: "",
    source_connection_id: "",
    target_connection_id: "",
    schedule: "0 2 * * *",
    customSchedule: "",
    schedulePreset: "0 2 * * *",
  });

  const fetchJobs = () => {
    setLoading(true);
    api
      .get("/sync")
      .then((res) => setJobs(res.data))
      .catch(() => toast.error("Failed to fetch sync jobs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs();
    api.get("/connections").then((res) => setConnections(res.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: "", source_connection_id: "", target_connection_id: "", schedule: "0 2 * * *", customSchedule: "", schedulePreset: "0 2 * * *" });
    setModalOpen(true);
  };

  const openEdit = (job: SyncJob) => {
    setEditTarget(job);
    const preset = CRON_PRESETS.find((p) => p.value === job.schedule);
    setForm({
      name: job.name,
      source_connection_id: String(job.source_connection_id),
      target_connection_id: String(job.target_connection_id),
      schedule: job.schedule,
      customSchedule: preset ? "" : job.schedule,
      schedulePreset: preset ? job.schedule : "custom",
    });
    setModalOpen(true);
  };

  const typeMismatch = () => {
    if (!form.source_connection_id || !form.target_connection_id) return false;
    const src = connections.find((c) => c.id === parseInt(form.source_connection_id));
    const tgt = connections.find((c) => c.id === parseInt(form.target_connection_id));
    return src && tgt && src.type !== tgt.type;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSchedule =
      form.schedulePreset === "custom" ? form.customSchedule : form.schedulePreset;
    try {
      if (editTarget) {
        await api.put(`/sync/${editTarget.id}`, { name: form.name, schedule: finalSchedule });
        toast.success("Sync job updated");
      } else {
        await api.post("/sync", {
          name: form.name,
          source_connection_id: parseInt(form.source_connection_id),
          target_connection_id: parseInt(form.target_connection_id),
          schedule: finalSchedule,
        });
        toast.success("Sync job created");
      }
      setModalOpen(false);
      fetchJobs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to save sync job");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sync job?")) return;
    try {
      await api.delete(`/sync/${id}`);
      toast.success("Sync job deleted");
      fetchJobs();
    } catch {
      toast.error("Failed to delete sync job");
    }
  };

  const handleToggle = async (job: SyncJob) => {
    try {
      await api.put(`/sync/${job.id}`, { enabled: !job.enabled });
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j))
      );
    } catch {
      toast.error("Failed to update sync job");
    }
  };

  const handleRunNow = async (id: number) => {
    setRunningId(id);
    try {
      await api.post(`/sync/${id}/run`);
      toast.success("Sync started — check run history for status");
      setTimeout(fetchJobs, 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to trigger sync");
    } finally {
      setRunningId(null);
    }
  };

  const toggleRuns = async (id: number) => {
    const next = new Set(expandedRuns);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!runsMap[id]) {
        try {
          const res = await api.get(`/sync/${id}/runs`);
          setRunsMap((prev) => ({ ...prev, [id]: res.data }));
        } catch {
          toast.error("Failed to load run history");
        }
      }
    }
    setExpandedRuns(next);
  };

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
    if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    if (status === "running") return <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#00b4ff]" />;
    return <Clock className="h-3.5 w-3.5 text-slate-600" />;
  };

  return (
    <div className="space-y-6">
      {plan !== "team" && plan !== "business" && plan !== "enterprise" && (
        <div className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-300">DB Sync is available on the <strong>Team</strong> plan and above.</p>
          <button onClick={() => setUpgradeOpen(true)} className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-400 transition">Upgrade</button>
        </div>
      )}
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlan={plan}
        reason="feature"
        feature="DB Sync (prod → staging)"
        onUpgraded={() => { setUpgradeOpen(false); window.location.reload(); }}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-xl font-semibold text-white">DB Sync</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Sync data from one database to another on a schedule.
          </p>
        </div>
        {plan === "team" ? (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <Plus className="h-4 w-4" />
            New Sync Job
          </button>
        ) : (
          <Link href="/billing" className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 border border-white/[0.08] transition hover:text-white">
            <Lock className="h-4 w-4" />
            New Sync Job
          </Link>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center" style={cardStyle}>
          <ArrowLeftRight className="h-10 w-10 text-slate-700" />
          <p className="font-grotesk text-sm font-semibold text-white">No sync jobs yet</p>
          <p className="text-xs text-slate-500">Sync prod data to staging automatically.</p>
          {plan === "team" ? (
            <button
              onClick={openCreate}
              className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              New Sync Job
            </button>
          ) : (
            <Link href="/billing" className="mt-2 rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white">
              Upgrade to Team
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <div key={job.id} style={cardStyle} className="overflow-hidden">
              <div className="p-5">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-grotesk text-sm font-semibold text-white">{job.name}</p>
                    {/* Source → Target */}
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <span
                        className="rounded px-1.5 py-0.5 font-jetbrains text-[10px] font-semibold"
                        style={{ background: `${dbColors[job.source_type] || "#94a3b8"}18`, color: dbColors[job.source_type] || "#94a3b8" }}
                      >
                        {job.source_connection_name}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                      <span
                        className="rounded px-1.5 py-0.5 font-jetbrains text-[10px] font-semibold"
                        style={{ background: `${dbColors[job.target_type] || "#94a3b8"}18`, color: dbColors[job.target_type] || "#94a3b8" }}
                      >
                        {job.target_connection_name}
                      </span>
                    </div>
                  </div>
                  <Switch checked={job.enabled} onCheckedChange={() => handleToggle(job)} />
                </div>

                {/* Schedule + last run */}
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {job.schedule ? cronHuman(job.schedule) : "No schedule"}
                  </span>
                  {job.last_run_status && (
                    <span className="flex items-center gap-1">
                      {statusIcon(job.last_run_status)}
                      {formatRelative(job.last_run_at)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => handleRunNow(job.id)}
                    disabled={runningId === job.id || job.status === "running"}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-300 disabled:opacity-50"
                  >
                    {runningId === job.id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {runningId === job.id ? "Syncing…" : "Sync Now"}
                  </button>
                  <button
                    onClick={() => openEdit(job)}
                    className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#6366f1]/30 hover:text-[#6366f1]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="rounded-lg border border-white/[0.08] p-1.5 text-slate-600 transition hover:border-red-500/30 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleRuns(job.id)}
                    className="ml-auto flex items-center gap-1 text-xs text-slate-600 transition hover:text-slate-400"
                  >
                    History
                    {expandedRuns.has(job.id) ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Run history */}
              {expandedRuns.has(job.id) && (
                <div className="border-t border-white/[0.06] px-5 py-4">
                  <p className="mb-3 font-jetbrains text-[10px] uppercase tracking-widest text-slate-600">
                    Run History
                  </p>
                  {!runsMap[job.id] ? (
                    <p className="text-xs text-slate-600">Loading…</p>
                  ) : runsMap[job.id].length === 0 ? (
                    <p className="text-xs text-slate-600">No runs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {runsMap[job.id].slice(0, 8).map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            {statusIcon(run.status)}
                            <span
                              className={`text-xs font-medium ${
                                run.status === "success"
                                  ? "text-emerald-400"
                                  : run.status === "failed"
                                  ? "text-red-400"
                                  : "text-[#00b4ff]"
                              }`}
                            >
                              {run.status}
                            </span>
                            {run.error_message && (
                              <span className="text-xs text-slate-600" title={run.error_message}>
                                {run.error_message.slice(0, 40)}…
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-600">
                            {formatRelative(run.started_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="border-white/[0.08] text-white sm:max-w-lg"
          style={{ background: "#0d1526" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white">
              {editTarget ? "Edit Sync Job" : "New Sync Job"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">Job Name</Label>
              <Input
                className={inputClass}
                placeholder="Prod → Staging sync"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            {!editTarget && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-400">Source</Label>
                    <Select
                      value={form.source_connection_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, source_connection_id: v }))}
                    >
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {connections.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-400">Target</Label>
                    <Select
                      value={form.target_connection_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, target_connection_id: v }))}
                    >
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Select target" />
                      </SelectTrigger>
                      <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {connections.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {typeMismatch() && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                    ⚠ Source and target must be the same database type for sync to work.
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">Schedule</Label>
              <Select
                value={form.schedulePreset}
                onValueChange={(v) => setForm((f) => ({ ...f, schedulePreset: v, schedule: v !== "custom" ? v : f.customSchedule }))}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.schedulePreset === "custom" && (
                <Input
                  className={inputClass + " mt-2 font-jetbrains text-xs"}
                  placeholder="0 2 * * *"
                  value={form.customSchedule}
                  onChange={(e) => setForm((f) => ({ ...f, customSchedule: e.target.value }))}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!editTarget && typeMismatch()}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {editTarget ? "Save Changes" : "Create Sync Job"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
