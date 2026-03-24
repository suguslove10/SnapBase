"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CalendarClock } from "lucide-react";
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
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 2am", value: "0 2 * * *" },
  { label: "Weekly Sunday", value: "0 0 * * 0" },
  { label: "Monthly", value: "0 0 1 * *" },
  { label: "Custom", value: "custom" },
];

const cronLabels: Record<string, string> = {
  "0 * * * *": "Every hour",
  "0 */6 * * *": "Every 6 hours",
  "0 0 * * *": "Daily at midnight",
  "0 2 * * *": "Daily at 2am",
  "0 0 * * 0": "Weekly Sunday",
  "0 0 1 * *": "Monthly",
};

function relativeTime(date: string | null): string {
  if (!date) return "-";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customCron, setCustomCron] = useState("");

  const fetchSchedules = () => { setLoading(true); api.get("/schedules").then((res) => { setSchedules(res.data); setLoading(false); }); };
  useEffect(() => { fetchSchedules(); api.get("/connections").then((res) => setConnections(res.data)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cronExpression = selectedPreset === "custom" ? customCron : selectedPreset;
    if (!cronExpression || !selectedConnection) { toast.error("Please fill all fields"); return; }
    try {
      await api.post("/schedules", { connection_id: parseInt(selectedConnection), cron_expression: cronExpression });
      toast.success("Schedule created");
      setOpen(false); setSelectedConnection(""); setSelectedPreset(""); setCustomCron("");
      fetchSchedules();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create schedule";
      toast.error(msg);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try { await api.patch(`/schedules/${id}`, { enabled }); toast.success(enabled ? "Schedule enabled" : "Schedule disabled"); fetchSchedules(); }
    catch { toast.error("Failed to update schedule"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this schedule?")) return;
    try { await api.delete(`/schedules/${id}`); toast.success("Schedule deleted"); fetchSchedules(); }
    catch { toast.error("Failed to delete schedule"); }
  };

  const inputClass = "border-white/10 bg-white/5 text-white placeholder:text-slate-500";

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-emerald-500/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Schedules</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
                <Plus className="mr-2 h-4 w-4" />Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="border-white/10 bg-[#1e293b] text-white">
              <DialogHeader><DialogTitle>Create Schedule</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">Connection</Label>
                  <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                    <SelectTrigger className={inputClass}><SelectValue placeholder="Select connection" /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#1e293b] text-white">
                      {connections.map((c) => (<SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.type})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs uppercase tracking-wider">Schedule</Label>
                  <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                    <SelectTrigger className={inputClass}><SelectValue placeholder="Select schedule" /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#1e293b] text-white">
                      {cronPresets.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label} {p.value !== "custom" && `(${p.value})`}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPreset === "custom" && (
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Cron Expression</Label>
                    <Input value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="*/5 * * * *" className={`${inputClass} font-mono`} />
                  </div>
                )}
                <div className="flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">Create Schedule</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="rounded-xl border border-white/10 bg-[#1e293b] p-6"><Skeleton className="h-32 w-full bg-white/5" /></div>)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#1e293b] py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <CalendarClock className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No schedules yet.</p>
          <p className="mt-1 text-xs text-slate-600">Create one to automate your backups.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s) => (
            <div key={s.id} className="group rounded-xl border border-white/10 bg-[#1e293b] p-5 transition-all hover:border-white/20 hover:shadow-lg hover:shadow-indigo-500/5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">{s.connection_name}</h3>
                  <Badge variant="outline" className="mt-1.5 border-white/10 font-mono text-[11px] text-slate-500">{s.cron_expression}</Badge>
                  {cronLabels[s.cron_expression] && (
                    <p className="mt-1 text-[11px] text-slate-600">{cronLabels[s.cron_expression]}</p>
                  )}
                </div>
                <Switch checked={s.enabled} onCheckedChange={(checked) => handleToggle(s.id, checked)} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-600">Last Run</p>
                  <p className="text-sm text-slate-400">{relativeTime(s.last_run)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-600">Next Run</p>
                  <p className="text-sm text-slate-400">{s.next_run ? new Date(s.next_run).toLocaleString() : "-"}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} className="text-red-400/60 hover:bg-red-500/10 hover:text-red-400 h-8 text-xs">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
