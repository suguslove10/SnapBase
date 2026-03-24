"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CalendarClock, Clock } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface Schedule {
  id: number;
  connection_id: number;
  connection_name: string;
  cron_expression: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

interface Connection {
  id: number;
  name: string;
  type: string;
}

const cronPresets = [
  { label: "Every hour",       value: "0 * * * *" },
  { label: "Every 6 hours",    value: "0 */6 * * *" },
  { label: "Daily at midnight",value: "0 0 * * *" },
  { label: "Daily at 2 am",    value: "0 2 * * *" },
  { label: "Weekly Sunday",    value: "0 0 * * 0" },
  { label: "Monthly",          value: "0 0 1 * *" },
  { label: "Custom",           value: "custom" },
];

const cronLabels: Record<string, string> = {
  "0 * * * *":   "Every hour",
  "0 */6 * * *": "Every 6 hours",
  "0 0 * * *":   "Daily at midnight",
  "0 2 * * *":   "Daily at 2 am",
  "0 0 * * 0":   "Weekly Sunday",
  "0 0 1 * *":   "Monthly",
};

function relativeTime(date: string | null): string {
  if (!date) return "—";
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
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const inputClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#00b4ff]/50";
const selectClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white";

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customCron, setCustomCron] = useState("");

  const fetchSchedules = () => {
    setLoading(true);
    api.get("/schedules").then((res) => { setSchedules(res.data); setLoading(false); });
  };

  useEffect(() => {
    fetchSchedules();
    api.get("/connections").then((res) => setConnections(res.data));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cronExpression = selectedPreset === "custom" ? customCron : selectedPreset;
    if (!cronExpression || !selectedConnection) { toast.error("Please fill all fields"); return; }
    try {
      await api.post("/schedules", { connection_id: parseInt(selectedConnection), cron_expression: cronExpression });
      toast.success("Schedule created");
      setOpen(false);
      setSelectedConnection(""); setSelectedPreset(""); setCustomCron("");
      fetchSchedules();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create schedule";
      toast.error(msg);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await api.patch(`/schedules/${id}`, { enabled });
      toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
      fetchSchedules();
    } catch {
      toast.error("Failed to update schedule");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await api.delete(`/schedules/${id}`);
      toast.success("Schedule deleted");
      fetchSchedules();
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Schedules</h1>
          <p className="mt-1 text-sm text-slate-500">Automate your database backups</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.3)]"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              <Plus className="h-4 w-4" />
              Add Schedule
            </button>
          </DialogTrigger>
          <DialogContent
            className="max-w-md text-white"
            style={{ background: "#0d1526", border: "1px solid rgba(0,180,255,0.15)", borderRadius: "1.25rem" }}
          >
            <DialogHeader>
              <DialogTitle className="font-grotesk text-lg font-semibold text-white">Create Schedule</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Connection</Label>
                <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                  <SelectTrigger className={selectClass}><SelectValue placeholder="Select connection" /></SelectTrigger>
                  <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Schedule</Label>
                <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                  <SelectTrigger className={selectClass}><SelectValue placeholder="Select frequency" /></SelectTrigger>
                  <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {cronPresets.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}{p.value !== "custom" && ` · ${p.value}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPreset === "custom" && (
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Cron Expression</Label>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="*/5 * * * *"
                    className={`${inputClass} font-jetbrains`}
                  />
                </div>
              )}
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-6" style={cardStyle}>
              <Skeleton className="h-32 w-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <CalendarClock className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No schedules yet.</p>
          <p className="mt-1 text-xs text-slate-600">Create one to automate your backups.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
              style={{
                ...cardStyle,
                borderLeft: s.enabled ? "3px solid rgba(0,180,255,0.4)" : "3px solid rgba(100,116,139,0.3)",
              }}
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-grotesk text-base font-semibold text-white truncate">{s.connection_name}</h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-jetbrains text-[10px] text-slate-400">
                      {s.cron_expression}
                    </span>
                  </div>
                  {cronLabels[s.cron_expression] && (
                    <p className="mt-1 font-jetbrains text-[11px] text-slate-600">{cronLabels[s.cron_expression]}</p>
                  )}
                </div>
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(checked) => handleToggle(s.id, checked)}
                  className="ml-3 shrink-0"
                />
              </div>

              {/* Status indicator */}
              <div className="mt-3 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${s.enabled ? "bg-[#00b4ff] animate-pulse" : "bg-slate-600"}`} />
                <span className="font-jetbrains text-[10px] text-slate-500">
                  {s.enabled ? "Active" : "Paused"}
                </span>
              </div>

              {/* Times */}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-600">Last run</p>
                  <p className="mt-0.5 text-xs text-slate-400">{relativeTime(s.last_run)}</p>
                </div>
                <div>
                  <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-600">Next run</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {s.next_run ? new Date(s.next_run).toLocaleString() : "—"}
                  </p>
                </div>
              </div>

              {/* Delete */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => handleDelete(s.id)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
