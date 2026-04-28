"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Play,
  ChevronDown,
  ChevronUp,
  Webhook,
  CheckCircle,
  XCircle,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import UpgradeModal from "@/components/UpgradeModal";

const ALL_EVENTS = [
  { value: "backup.success", label: "Backup Success" },
  { value: "backup.failed", label: "Backup Failed" },
  { value: "backup.started", label: "Backup Started" },
  { value: "anomaly.detected", label: "Anomaly Detected" },
  { value: "schedule.created", label: "Schedule Created" },
  { value: "schedule.deleted", label: "Schedule Deleted" },
  { value: "member.invited", label: "Member Invited" },
  { value: "member.joined", label: "Member Joined" },
];

interface WebhookItem {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  created_at: string;
}

interface Delivery {
  id: number;
  event: string;
  response_status: number;
  response_body: string;
  failed: boolean;
  created_at: string;
}

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const inputClass =
  "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20";

export default function WebhooksPage() {
  const { plan } = useAuth();
  const [items, setItems] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookItem | null>(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<number>>(new Set());
  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});
  const [testingId, setTestingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    url: "",
    secret: "",
    events: ["backup.success", "backup.failed"] as string[],
  });

  const fetch = () => {
    setLoading(true);
    api
      .get("/webhooks")
      .then((res) => setItems(res.data))
      .catch(() => toast.error("Failed to fetch webhooks"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: "", url: "", secret: "", events: ["backup.success", "backup.failed"] });
    setModalOpen(true);
  };

  const openEdit = (w: WebhookItem) => {
    setEditTarget(w);
    setForm({ name: w.name, url: w.url, secret: w.secret || "", events: w.events });
    setModalOpen(true);
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editTarget) {
        await api.put(`/webhooks/${editTarget.id}`, form);
        toast.success("Webhook updated");
      } else {
        await api.post("/webhooks", form);
        toast.success("Webhook created");
      }
      setModalOpen(false);
      fetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to save webhook");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this webhook?")) return;
    try {
      await api.delete(`/webhooks/${id}`);
      toast.success("Webhook deleted");
      fetch();
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleToggle = async (w: WebhookItem) => {
    try {
      await api.put(`/webhooks/${w.id}`, { enabled: !w.enabled });
      setItems((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x))
      );
    } catch {
      toast.error("Failed to update webhook");
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const res = await api.post(`/webhooks/${id}/test`);
      if (res.data.success) {
        toast.success(`Test delivered — HTTP ${res.data.status_code}`);
      } else {
        toast.error(`Test failed — HTTP ${res.data.status_code || "0"}`);
      }
    } catch {
      toast.error("Test delivery failed");
    } finally {
      setTestingId(null);
    }
  };

  const toggleDeliveries = async (id: number) => {
    const next = new Set(expandedDeliveries);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!deliveries[id]) {
        try {
          const res = await api.get(`/webhooks/${id}/deliveries`);
          setDeliveries((prev) => ({ ...prev, [id]: res.data }));
        } catch {
          toast.error("Failed to load delivery history");
        }
      }
    }
    setExpandedDeliveries(next);
  };

  const eventBadgeColor: Record<string, string> = {
    "backup.success": "bg-emerald-500/10 text-emerald-400",
    "backup.failed": "bg-red-500/10 text-red-400",
    "backup.started": "bg-blue-500/10 text-blue-400",
    "anomaly.detected": "bg-yellow-500/10 text-yellow-400",
    "schedule.created": "bg-purple-500/10 text-purple-400",
    "schedule.deleted": "bg-orange-500/10 text-orange-400",
    "member.invited": "bg-cyan-500/10 text-cyan-400",
    "member.joined": "bg-teal-500/10 text-teal-400",
  };

  return (
    <div className="space-y-6">
      {plan === "free" && (
        <div className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-300">Webhooks are available on <strong>Pro</strong> and <strong>Team</strong> plans.</p>
          <button onClick={() => setUpgradeOpen(true)} className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-400 transition">Upgrade</button>
        </div>
      )}
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlan={plan}
        reason="feature"
        feature="Webhooks"
        onUpgraded={() => { setUpgradeOpen(false); window.location.reload(); }}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-xl font-semibold text-white">Webhooks</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Receive real-time HTTP notifications for backup and org events.
          </p>
        </div>
        {plan === "free" ? (
          <Link href="/billing" className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white">
            <Lock className="h-4 w-4" />
            Add Webhook
          </Link>
        ) : (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <Plus className="h-4 w-4" />
            Add Webhook
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 py-16 text-center"
          style={cardStyle}
        >
          <Webhook className="h-10 w-10 text-slate-700" />
          <p className="font-grotesk text-sm font-semibold text-white">No webhooks yet</p>
          <p className="text-xs text-slate-500">
            Add a webhook to receive HTTP notifications for backup events.
          </p>
          {plan === "free" ? (
            <Link
              href="/billing"
              className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white"
            >
              <Lock className="h-4 w-4" />
              Upgrade to Pro
            </Link>
          ) : (
            <button
              onClick={openCreate}
              className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              Add Webhook
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((w) => (
            <div key={w.id} style={cardStyle} className="overflow-hidden">
              <div className="p-5">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-grotesk text-sm font-semibold text-white">{w.name}</p>
                    <p
                      className="mt-0.5 truncate font-jetbrains text-xs text-slate-500"
                      title={w.url}
                    >
                      {w.url}
                    </p>
                  </div>
                  <Switch
                    checked={w.enabled}
                    onCheckedChange={() => handleToggle(w)}
                  />
                </div>

                {/* Event badges */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(w.events || []).map((ev) => (
                    <span
                      key={ev}
                      className={`rounded-full px-2 py-0.5 font-jetbrains text-[10px] font-medium ${
                        eventBadgeColor[ev] ?? "bg-slate-500/10 text-slate-400"
                      }`}
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => handleTest(w.id)}
                    disabled={testingId === w.id}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00b4ff]/30 hover:text-[#00b4ff] disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    {testingId === w.id ? "Sending…" : "Test"}
                  </button>
                  <button
                    onClick={() => openEdit(w)}
                    className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#6366f1]/30 hover:text-[#6366f1]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="rounded-lg border border-white/[0.08] p-1.5 text-slate-600 transition hover:border-red-500/30 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleDeliveries(w.id)}
                    className="ml-auto flex items-center gap-1 text-xs text-slate-600 transition hover:text-slate-400"
                  >
                    History
                    {expandedDeliveries.has(w.id) ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Delivery history */}
              {expandedDeliveries.has(w.id) && (
                <div className="border-t border-white/[0.06] px-5 py-4">
                  <p className="mb-3 font-jetbrains text-[10px] uppercase tracking-widest text-slate-600">
                    Recent Deliveries
                  </p>
                  {!deliveries[w.id] ? (
                    <p className="text-xs text-slate-600">Loading…</p>
                  ) : deliveries[w.id].length === 0 ? (
                    <p className="text-xs text-slate-600">No deliveries yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {deliveries[w.id].slice(0, 10).map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {d.failed ? (
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            )}
                            <span
                              className={`rounded-full px-1.5 py-0.5 font-jetbrains text-[10px] ${
                                eventBadgeColor[d.event] ?? "bg-slate-500/10 text-slate-400"
                              }`}
                            >
                              {d.event}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {d.response_status > 0 && (
                              <span
                                className={`font-jetbrains text-xs ${
                                  d.failed ? "text-red-400" : "text-emerald-400"
                                }`}
                              >
                                {d.response_status}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-600">
                              {new Date(d.created_at).toLocaleString()}
                            </span>
                          </div>
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

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="border-white/[0.08] text-white sm:max-w-lg"
          style={{ background: "#0d1526" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white">
              {editTarget ? "Edit Webhook" : "Add Webhook"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">Name</Label>
              <Input
                className={inputClass}
                placeholder="My Webhook"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">URL</Label>
              <Input
                className={inputClass}
                placeholder="https://example.com/hooks/snapbase"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400">
                Secret{" "}
                <span className="text-slate-600">(optional — used for HMAC signature)</span>
              </Label>
              <Input
                className={inputClass}
                placeholder="my-secret-key"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-400">Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENTS.map((ev) => (
                  <label
                    key={ev.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 transition hover:border-white/[0.12]"
                  >
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev.value)}
                      onChange={() => toggleEvent(ev.value)}
                      className="h-3.5 w-3.5 accent-[#6366f1]"
                    />
                    <span className="text-xs text-slate-300">{ev.label}</span>
                  </label>
                ))}
              </div>
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
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {editTarget ? "Save Changes" : "Create Webhook"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
