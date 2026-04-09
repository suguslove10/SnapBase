"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Plus, Trash2, Zap, Play, Database, Lock, LockOpen, ShieldCheck, Pencil, Cog, Shield, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Connection {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  retention_days: number;
  storage_provider_id: number | null;
  encryption_enabled: boolean;
  created_at: string;
}

interface ConnectionPermission {
  id: number;
  connection_id: number;
  org_member_id: number;
  user_id: number;
  email: string;
  name: string;
  role: string;
  can_view: boolean;
  can_backup: boolean;
  can_restore: boolean;
  can_manage: boolean;
}

interface BackupHook {
  id: number;
  connection_id: number;
  hook_type: "pre" | "post";
  hook_kind: "sql" | "webhook";
  sql_script: string;
  webhook_url: string;
  timeout_seconds: number;
  enabled: boolean;
}

interface HookSummaryItem {
  connection_id: number;
  has_pre: boolean;
  has_post: boolean;
}

interface StorageProvider {
  id: number;
  name: string;
  provider_type: string;
  is_default: boolean;
}

interface UsageInfo {
  storage_used_formatted: string;
  storage_limit_formatted: string;
  connections_used: number;
  connections_limit: number;
  plan: string;
}

interface ConnHealth {
  connection_id: number;
  connection_name: string;
  score: number;
  grade: string;
  status: string;
  factors: {
    last_backup_success: boolean;
    last_backup_points: number;
    verified: boolean;
    verification_points: number;
    backed_up_recently: boolean;
    recency_points: number;
    no_anomalies: boolean;
    anomaly_points: number;
    has_schedule: boolean;
    schedule_points: number;
  };
  last_backup_at: string | null;
  next_backup_at: string | null;
}

const defaultPorts: Record<string, number> = {
  postgres: 5432, mysql: 3306, mongodb: 27017, sqlite: 0,
};

const dbColors: Record<string, string> = {
  postgres: "#00b4ff",
  mysql:    "#ff9500",
  mongodb:  "#00ff88",
  sqlite:   "#94a3b8",
};

const dbLabels: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql:    "MySQL",
  mongodb:  "MongoDB",
  sqlite:   "SQLite",
};

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const inputClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#00b4ff]/50";
const selectClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white";

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#00ff88";
    case "B": return "#00b4ff";
    case "C": return "#f59e0b";
    case "D": return "#f97316";
    default:   return "#ef4444";
  }
}

function healthTooltip(h: ConnHealth): string {
  const f = h.factors;
  const lines = [
    f.last_backup_success ? `✅ Last backup succeeded (+${f.last_backup_points})` : `❌ Last backup failed (+0)`,
    f.verified ? `✅ Backup verified (+${f.verification_points})` : `❌ Not verified (+0)`,
    f.backed_up_recently ? `✅ Backed up recently (+${f.recency_points})` : `❌ No recent backup (+0)`,
    f.no_anomalies ? `✅ No anomalies (+${f.anomaly_points})` : `⚠️ Anomalies detected (+${f.anomaly_points})`,
  ];
  return lines.join("\n");
}

export default function ConnectionsPage() {
  const { hasPermission, plan } = useAuth();
  const canManage = hasPermission("manage_connections");
  const canTrigger = hasPermission("trigger_backup");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean>>({});
  const [storageProviders, setStorageProviders] = useState<StorageProvider[]>([]);
  const [encTarget, setEncTarget] = useState<Connection | null>(null);
  const [encPassword, setEncPassword] = useState("");
  const [encConfirm, setEncConfirm] = useState("");
  const [encSaving, setEncSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [editForm, setEditForm] = useState({ name: "", host: "", port: 0, database: "", username: "", password: "", auth_source: "admin", storage_provider_id: null as number | null });
  const [editSaving, setEditSaving] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [healthMap, setHealthMap] = useState<Record<number, ConnHealth>>({});
  const [form, setForm] = useState({
    name: "", type: "postgres", host: "localhost", port: 5432,
    database: "", username: "", password: "", retention_days: 30, storage_provider_id: "", auth_source: "admin",
  });

  // Hooks state
  const [hooksTarget, setHooksTarget] = useState<Connection | null>(null);
  const [hooksList, setHooksList] = useState<BackupHook[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hookSummary, setHookSummary] = useState<Record<number, HookSummaryItem>>({});
  const [hookForm, setHookForm] = useState({
    hook_type: "pre" as "pre" | "post",
    hook_kind: "sql" as "sql" | "webhook",
    sql_script: "",
    webhook_url: "",
    timeout_seconds: 30,
  });
  const [hookFormOpen, setHookFormOpen] = useState(false);
  const [editHookTarget, setEditHookTarget] = useState<BackupHook | null>(null);

  // Permissions state
  const [permsTarget, setPermsTarget] = useState<Connection | null>(null);
  const [permsList, setPermsList] = useState<ConnectionPermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState<number | null>(null);

  const fetchConnections = () => {
    setLoading(true);
    api.get("/connections").then((res) => { setConnections(res.data); setLoading(false); });
  };

  const fetchUsage = () => {
    api.get("/billing/usage").then((res) => setUsage(res.data)).catch(() => {});
  };

  const fetchHealth = () => {
    api.get("/connections/health").then((res) => {
      const map: Record<number, ConnHealth> = {};
      for (const h of (res.data as ConnHealth[])) {
        map[h.connection_id] = h;
      }
      setHealthMap(map);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchConnections();
    fetchUsage();
    fetchHealth();
    api.get("/storage-providers").then((res) => setStorageProviders(res.data));
    api.get("/connections/hooks/summary").then((res) => {
      const map: Record<number, HookSummaryItem> = {};
      for (const item of (res.data as HookSummaryItem[])) map[item.connection_id] = item;
      setHookSummary(map);
    }).catch(() => {});
  }, []);

  const openHooksModal = (conn: Connection) => {
    setHooksTarget(conn);
    setHooksLoading(true);
    setHookFormOpen(false);
    setEditHookTarget(null);
    api.get(`/connections/${conn.id}/hooks`).then((res) => {
      setHooksList(res.data);
    }).catch(() => toast.error("Failed to load hooks")).finally(() => setHooksLoading(false));
  };

  const refreshHooks = (connId: number) => {
    api.get(`/connections/${connId}/hooks`).then((res) => setHooksList(res.data)).catch(() => {});
    api.get("/connections/hooks/summary").then((res) => {
      const map: Record<number, HookSummaryItem> = {};
      for (const item of (res.data as HookSummaryItem[])) map[item.connection_id] = item;
      setHookSummary(map);
    }).catch(() => {});
  };

  const resetHookForm = () => {
    setHookForm({ hook_type: "pre", hook_kind: "sql", sql_script: "", webhook_url: "", timeout_seconds: 30 });
    setEditHookTarget(null);
    setHookFormOpen(false);
  };

  const openAddHook = () => {
    setEditHookTarget(null);
    setHookForm({ hook_type: "pre", hook_kind: "sql", sql_script: "", webhook_url: "", timeout_seconds: 30 });
    setHookFormOpen(true);
  };

  const openEditHook = (hook: BackupHook) => {
    setEditHookTarget(hook);
    setHookForm({
      hook_type: hook.hook_type,
      hook_kind: hook.hook_kind,
      sql_script: hook.sql_script,
      webhook_url: hook.webhook_url,
      timeout_seconds: hook.timeout_seconds,
    });
    setHookFormOpen(true);
  };

  const handleSaveHook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hooksTarget) return;
    try {
      if (editHookTarget) {
        await api.put(`/connections/${hooksTarget.id}/hooks/${editHookTarget.id}`, hookForm);
        toast.success("Hook updated");
      } else {
        await api.post(`/connections/${hooksTarget.id}/hooks`, hookForm);
        toast.success("Hook created");
      }
      resetHookForm();
      refreshHooks(hooksTarget.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to save hook");
    }
  };

  const handleDeleteHook = async (hookId: number) => {
    if (!hooksTarget) return;
    if (!confirm("Delete this hook?")) return;
    try {
      await api.delete(`/connections/${hooksTarget.id}/hooks/${hookId}`);
      toast.success("Hook deleted");
      refreshHooks(hooksTarget.id);
    } catch {
      toast.error("Failed to delete hook");
    }
  };

  const handleToggleHook = async (hook: BackupHook) => {
    if (!hooksTarget) return;
    try {
      await api.put(`/connections/${hooksTarget.id}/hooks/${hook.id}`, { enabled: !hook.enabled });
      setHooksList((prev) => prev.map((h) => h.id === hook.id ? { ...h, enabled: !h.enabled } : h));
    } catch {
      toast.error("Failed to update hook");
    }
  };

  const openPermsModal = (conn: Connection) => {
    setPermsTarget(conn);
    setPermsLoading(true);
    api.get(`/connections/${conn.id}/permissions`)
      .then((res) => setPermsList(res.data))
      .catch(() => toast.error("Failed to load permissions"))
      .finally(() => setPermsLoading(false));
  };

  const handlePermToggle = async (perm: ConnectionPermission, field: keyof Pick<ConnectionPermission, "can_view" | "can_backup" | "can_restore" | "can_manage">) => {
    setPermsSaving(perm.org_member_id);
    const updated = { ...perm, [field]: !perm[field] };
    try {
      await api.put(`/connections/${perm.connection_id}/permissions`, {
        org_member_id: perm.org_member_id,
        can_view: updated.can_view,
        can_backup: updated.can_backup,
        can_restore: updated.can_restore,
        can_manage: updated.can_manage,
      });
      setPermsList((prev) => prev.map((p) => p.org_member_id === perm.org_member_id ? updated : p));
    } catch {
      toast.error("Failed to update permission");
    } finally {
      setPermsSaving(null);
    }
  };

  const handleTypeChange = (type: string) => {
    setForm({ ...form, type, port: defaultPorts[type] || 0 });
  };

  const handleAddClick = () => {
    if (usage && usage.connections_limit !== -1 && usage.connections_used >= usage.connections_limit) {
      setShowUpgradeModal(true);
    } else {
      setOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Please fill in the connection name"); return; }
    if (!form.database.trim()) { toast.error("Please fill in the database name"); return; }
    try {
      const payload = {
        ...form,
        storage_provider_id:
          form.storage_provider_id && form.storage_provider_id !== "default"
            ? parseInt(form.storage_provider_id)
            : null,
      };
      await api.post("/connections", payload);
      toast.success("Connection created");
      setOpen(false);
      setForm({ name: "", type: "postgres", host: "localhost", port: 5432, database: "", username: "", password: "", retention_days: 30, storage_provider_id: "", auth_source: "admin" });
      fetchConnections();
      fetchUsage();
    } catch {
      toast.error("Failed to create connection");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this connection?")) return;
    try {
      await api.delete(`/connections/${id}`);
      toast.success("Connection deleted");
      fetchConnections();
      fetchUsage();
    } catch {
      toast.error("Failed to delete connection");
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      const res = await api.post(`/connections/${id}/test`);
      if (res.data.success) {
        toast.success("Connection successful");
        setTestResults((prev) => ({ ...prev, [id]: true }));
      } else {
        toast.error(res.data.error || "Connection failed");
        setTestResults((prev) => ({ ...prev, [id]: false }));
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Test failed — check server logs");
      setTestResults((prev) => ({ ...prev, [id]: false }));
    } finally {
      setTesting(null);
    }
  };

  const handleBackup = async (id: number) => {
    try {
      await api.post(`/backups/trigger/${id}`);
      toast.success("Backup triggered");
    } catch {
      toast.error("Failed to trigger backup");
    }
  };

  const openEditModal = (conn: Connection) => {
    setEditTarget(conn);
    setEditForm({
      name: conn.name,
      host: conn.host || "",
      port: conn.port || 0,
      database: conn.database,
      username: conn.username || "",
      password: "",
      auth_source: "admin",
      storage_provider_id: conn.storage_provider_id ?? null,
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    if (!editForm.database.trim()) { toast.error("Database is required"); return; }
    setEditSaving(true);
    try {
      await api.patch(`/connections/${editTarget.id}`, editForm);
      if (editForm.storage_provider_id !== (editTarget.storage_provider_id ?? null)) {
        await api.patch(`/connections/${editTarget.id}/storage`, {
          storage_provider_id: editForm.storage_provider_id,
        });
      }
      toast.success("Connection updated");
      setEditTarget(null);
      fetchConnections();
    } catch {
      toast.error("Failed to update connection");
    } finally {
      setEditSaving(false);
    }
  };

  const openEncModal = (conn: Connection) => {
    setEncTarget(conn);
    setEncPassword("");
    setEncConfirm("");
  };

  const handleSetEncryption = async (enabled: boolean) => {
    if (!encTarget) return;
    if (enabled) {
      if (encPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
      if (encPassword !== encConfirm) { toast.error("Passwords do not match"); return; }
    }
    setEncSaving(true);
    try {
      await api.post(`/connections/${encTarget.id}/encryption`, { enabled, password: encPassword });
      toast.success(enabled ? "Encryption enabled — future backups will be AES-256 encrypted" : "Encryption disabled");
      setEncTarget(null);
      fetchConnections();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to update encryption";
      toast.error(msg);
    } finally {
      setEncSaving(false);
    }
  };

  const isSqlite = form.type === "sqlite";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Connections</h1>
          {usage ? (
            <p className="mt-1 font-jetbrains text-[11px] text-slate-500">
              {usage.connections_used}/{usage.connections_limit === -1 ? "∞" : usage.connections_limit} connections used
              {" · "}
              {usage.storage_used_formatted} / {usage.storage_limit_formatted} storage
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Manage your database connections</p>
          )}
        </div>
        {canManage && (
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.3)] whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
          >
            <Plus className="h-4 w-4" />
            Add Connection
          </button>
        )}
      </div>

      {/* Add Connection Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(0,180,255,0.15)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-lg font-semibold text-white">Add Connection</DialogTitle>
          </DialogHeader>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <p className="text-xs text-amber-400">
              Whitelist this server IP in your database firewall:{" "}
              <span className="font-jetbrains font-bold select-all">161.118.183.218</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Type</Label>
                <Select value={form.type} onValueChange={handleTypeChange}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isSqlite && (
                <>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Host</Label>
                    <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Port</Label>
                    <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })} className={inputClass} />
                  </div>
                </>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                  {isSqlite ? "File Path" : "Database"}
                </Label>
                <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className={inputClass} />
              </div>

              {!isSqlite && (
                <>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Username</Label>
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Password</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
                  </div>
                  {form.type === "mongodb" && (
                    <div className="col-span-2 space-y-1.5">
                      <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                        Auth Source <span className="normal-case text-slate-700">(optional)</span>
                      </Label>
                      <Input
                        value={form.auth_source}
                        onChange={(e) => setForm({ ...form, auth_source: e.target.value })}
                        placeholder="admin"
                        className={inputClass}
                      />
                      <p className="font-jetbrains text-[10px] text-slate-600">Leave as &apos;admin&apos; for MongoDB Atlas</p>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Retention</Label>
                <Select value={form.retention_days.toString()} onValueChange={(v) => setForm({ ...form, retention_days: parseInt(v) })}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="0">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {storageProviders.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Storage</Label>
                  <Select value={form.storage_provider_id} onValueChange={(v) => setForm({ ...form, storage_provider_id: v })}>
                    <SelectTrigger className={selectClass}><SelectValue placeholder="Default" /></SelectTrigger>
                    <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <SelectItem value="default">Default</SelectItem>
                      {storageProviders.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id.toString()}>
                          {sp.name}{sp.is_default ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                Save Connection
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upgrade limit modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent
          className="max-w-sm text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-lg font-semibold text-white">Connection limit reached</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              You&apos;ve reached your connection limit ({usage?.connections_used}/{usage?.connections_limit === -1 ? "∞" : usage?.connections_limit}).
              {usage?.plan === "free" && " Upgrade to Pro for up to 5 connections."}
              {usage?.plan === "pro" && " Upgrade to Team for unlimited connections."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
              <a
                href="/billing"
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {usage?.plan === "free" ? "Upgrade to Pro" : "Upgrade to Team"}
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-6" style={cardStyle}>
              <Skeleton className="h-32 w-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <Database className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No connections yet.</p>
          <p className="mt-1 text-xs text-slate-600">Click &ldquo;Add Connection&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => {
            const color = dbColors[conn.type] || "#94a3b8";
            const tested = testResults[conn.id];
            const health = healthMap[conn.id];
            return (
              <div
                key={conn.id}
                className="group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                style={{
                  ...cardStyle,
                  borderLeft: `3px solid ${color}40`,
                }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <h3 className="font-grotesk text-base font-semibold text-white truncate">{conn.name}</h3>
                    {conn.encryption_enabled ? (
                      <span title="Backup encryption enabled" className="flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5">
                        <Lock className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="font-jetbrains text-[9px] text-emerald-400">Encrypted</span>
                      </span>
                    ) : (
                      <span title="Backup encryption disabled" className="flex shrink-0 items-center gap-1 rounded-md border border-slate-700/50 bg-slate-800/30 px-1.5 py-0.5">
                        <LockOpen className="h-2.5 w-2.5 text-slate-600" />
                        <span className="font-jetbrains text-[9px] text-slate-600">Unencrypted</span>
                      </span>
                    )}
                    {tested === true && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00ff88]" />
                      </span>
                    )}
                    {tested === false && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                      </span>
                    )}
                  </div>

                  {/* Health score badge */}
                  {health && (
                    <div
                      title={healthTooltip(health)}
                      className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 cursor-default"
                      style={{ background: `${gradeColor(health.grade)}15`, border: `1px solid ${gradeColor(health.grade)}30` }}
                    >
                      <span className="font-jetbrains text-sm font-bold leading-none" style={{ color: gradeColor(health.grade) }}>
                        {health.score}
                      </span>
                      <span className="font-jetbrains text-[9px] font-bold leading-tight" style={{ color: gradeColor(health.grade) }}>
                        {health.grade}
                      </span>
                      <span className="font-jetbrains text-[8px] text-slate-600 leading-tight">Health</span>
                    </div>
                  )}
                </div>

                {/* DB type badge */}
                <div className="mt-1.5">
                  <span
                    className="rounded-lg px-2 py-0.5 font-jetbrains text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: `${color}18`, color }}
                  >
                    {dbLabels[conn.type] || conn.type}
                  </span>
                </div>

                {/* Connection string */}
                <p className="mt-2 font-jetbrains text-[11px] text-slate-500">
                  {conn.type === "sqlite"
                    ? conn.database
                    : `${conn.host}:${conn.port}/${conn.database}`}
                </p>
                <p className="mt-1 font-jetbrains text-[11px] text-slate-600">
                  Retention: {conn.retention_days > 0 ? `${conn.retention_days} days` : "forever"}
                </p>

                {/* Actions */}
                {(canManage || canTrigger) && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canManage && (
                      <button
                        onClick={() => handleTest(conn.id)}
                        disabled={testing === conn.id}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00b4ff]/30 hover:text-white disabled:opacity-50"
                      >
                        <Zap className="h-3 w-3" />
                        {testing === conn.id ? "Testing…" : "Test"}
                      </button>
                    )}
                    {canTrigger && (
                      <button
                        onClick={() => handleBackup(conn.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00f5d4]/30 hover:text-white"
                      >
                        <Play className="h-3 w-3" />
                        Backup
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => openEncModal(conn)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Encryption
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => openEditModal(conn)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#6366f1]/30 hover:text-[#a5b4fc]"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                    {canManage && (
                      plan === "free" ? (
                        <Link href="/billing" className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-600 cursor-not-allowed" title="Pro plan required">
                          <Lock className="h-3 w-3" />
                          Hooks
                        </Link>
                      ) : (
                        <button
                          onClick={() => openHooksModal(conn)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-amber-500/30 hover:text-amber-300"
                        >
                          <Cog className="h-3 w-3" />
                          Hooks
                          {hookSummary[conn.id] && (
                            <span className="ml-0.5 flex gap-1">
                              {hookSummary[conn.id].has_pre && (
                                <span className="rounded bg-amber-500/15 px-1 font-jetbrains text-[9px] text-amber-400">PRE</span>
                              )}
                              {hookSummary[conn.id].has_post && (
                                <span className="rounded bg-blue-500/15 px-1 font-jetbrains text-[9px] text-blue-400">POST</span>
                              )}
                            </span>
                          )}
                        </button>
                      )
                    )}
                    {canManage && (
                      plan !== "team" ? (
                        <Link href="/billing" className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-600 cursor-not-allowed" title="Team plan required">
                          <Lock className="h-3 w-3" />
                          Permissions
                        </Link>
                      ) : (
                        <button
                          onClick={() => openPermsModal(conn)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                        >
                          <Shield className="h-3 w-3" />
                          Permissions
                        </button>
                      )
                    )}
                    {canManage && (
                      <button
                        onClick={() => handleDelete(conn.id)}
                        className="ml-auto rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Connection Modal */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o && !editSaving) setEditTarget(null); }}>
        <DialogContent
          className="max-w-lg text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-lg font-semibold text-white flex items-center gap-2">
              <Pencil className="h-4 w-4 text-[#a5b4fc]" />
              Edit Connection
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Type</Label>
                <div className="flex h-10 items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-3">
                  <span
                    className="font-jetbrains text-xs font-semibold uppercase tracking-wider"
                    style={{ color: dbColors[editTarget?.type || ""] || "#94a3b8" }}
                  >
                    {dbLabels[editTarget?.type || ""] || editTarget?.type}
                  </span>
                </div>
              </div>

              {editTarget?.type !== "sqlite" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Host</Label>
                    <Input value={editForm.host} onChange={(e) => setEditForm({ ...editForm, host: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Port</Label>
                    <Input type="number" value={editForm.port} onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) })} className={inputClass} />
                  </div>
                </>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">
                  {editTarget?.type === "sqlite" ? "File Path" : "Database"}
                </Label>
                <Input value={editForm.database} onChange={(e) => setEditForm({ ...editForm, database: e.target.value })} className={inputClass} />
              </div>

              {editTarget?.type !== "sqlite" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Username</Label>
                    <Input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">New Password</Label>
                    <Input
                      type="password"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="Leave empty to keep current"
                      className={inputClass}
                    />
                  </div>
                  {editTarget?.type === "mongodb" && (
                    <div className="col-span-2 space-y-1.5">
                      <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Auth Source</Label>
                      <Input value={editForm.auth_source} onChange={(e) => setEditForm({ ...editForm, auth_source: e.target.value })} className={inputClass} />
                    </div>
                  )}
                </>
              )}
            </div>

            {storageProviders.length > 0 && (
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Storage Provider</Label>
                <Select
                  value={editForm.storage_provider_id?.toString() ?? "default"}
                  onValueChange={(v) => setEditForm({ ...editForm, storage_provider_id: v === "default" ? null : parseInt(v) })}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <SelectItem value="default">Default storage</SelectItem>
                    {storageProviders.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id.toString()}>
                        {sp.name}{sp.is_default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditTarget(null)}
                className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hooks Modal */}
      <Dialog open={!!hooksTarget} onOpenChange={(o) => { if (!o) { setHooksTarget(null); resetHookForm(); } }}>
        <DialogContent
          className="max-w-xl text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white flex items-center gap-2">
              <Cog className="h-4 w-4 text-amber-400" />
              Backup Hooks — {hooksTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            Run SQL scripts or call webhook URLs before or after each backup. Hook failures are logged but do not fail the backup.
          </p>

          {hooksLoading ? (
            <div className="space-y-2 py-4">
              <div className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
              <div className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Existing hooks grouped by type */}
              {["pre", "post"].map((ht) => {
                const htHooks = hooksList.filter((h) => h.hook_type === ht);
                return (
                  <div key={ht}>
                    <p className="mb-2 font-jetbrains text-[10px] uppercase tracking-widest text-slate-600">
                      {ht === "pre" ? "Pre-backup hooks" : "Post-backup hooks"}
                    </p>
                    {htHooks.length === 0 ? (
                      <p className="text-xs text-slate-700 italic pl-1">None</p>
                    ) : (
                      <div className="space-y-2">
                        {htHooks.map((hook) => (
                          <div key={hook.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                            <span className={`rounded px-1.5 py-0.5 font-jetbrains text-[9px] uppercase font-semibold ${hook.hook_kind === "sql" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
                              {hook.hook_kind}
                            </span>
                            <p className="flex-1 truncate font-jetbrains text-xs text-slate-400" title={hook.hook_kind === "sql" ? hook.sql_script : hook.webhook_url}>
                              {hook.hook_kind === "sql"
                                ? (hook.sql_script.slice(0, 60) + (hook.sql_script.length > 60 ? "…" : ""))
                                : hook.webhook_url}
                            </p>
                            <button onClick={() => handleToggleHook(hook)} title={hook.enabled ? "Disable" : "Enable"}>
                              <span className={`h-2 w-2 rounded-full inline-block ${hook.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                            </button>
                            <button onClick={() => openEditHook(hook)} className="text-xs text-slate-600 hover:text-slate-300 transition">Edit</button>
                            <button onClick={() => handleDeleteHook(hook.id)} className="text-slate-600 hover:text-red-400 transition">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add / Edit hook form */}
              {hookFormOpen ? (
                <form onSubmit={handleSaveHook} className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="font-grotesk text-xs font-semibold text-amber-300">
                    {editHookTarget ? "Edit Hook" : "New Hook"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Timing</label>
                      <select
                        value={hookForm.hook_type}
                        onChange={(e) => setHookForm((f) => ({ ...f, hook_type: e.target.value as "pre" | "post" }))}
                        disabled={!!editHookTarget}
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        <option value="pre">Pre-backup</option>
                        <option value="post">Post-backup</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Type</label>
                      <select
                        value={hookForm.hook_kind}
                        onChange={(e) => setHookForm((f) => ({ ...f, hook_kind: e.target.value as "sql" | "webhook" }))}
                        disabled={!!editHookTarget}
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        <option value="sql">SQL Script</option>
                        <option value="webhook">Webhook URL</option>
                      </select>
                    </div>
                  </div>
                  {hookForm.hook_kind === "sql" ? (
                    <div className="space-y-1">
                      <label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">SQL Script</label>
                      <textarea
                        value={hookForm.sql_script}
                        onChange={(e) => setHookForm((f) => ({ ...f, sql_script: e.target.value }))}
                        rows={3}
                        placeholder="-- Example: CHECKPOINT;"
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 font-jetbrains text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-amber-500/40 resize-none"
                      />
                      <p className="font-jetbrains text-[10px] text-slate-700">Runs against your database {hookForm.hook_type === "pre" ? "before" : "after"} each backup</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Webhook URL</label>
                      <input
                        type="url"
                        value={hookForm.webhook_url}
                        onChange={(e) => setHookForm((f) => ({ ...f, webhook_url: e.target.value }))}
                        placeholder="https://example.com/hook"
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-amber-500/40"
                      />
                      <p className="font-jetbrains text-[10px] text-slate-700">POST request sent {hookForm.hook_type === "pre" ? "before" : "after"} backup starts</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Timeout</label>
                    <select
                      value={hookForm.timeout_seconds}
                      onChange={(e) => setHookForm((f) => ({ ...f, timeout_seconds: parseInt(e.target.value) }))}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white"
                    >
                      {[10, 30, 60, 120].map((t) => <option key={t} value={t}>{t}s</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={resetHookForm} className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition">Cancel</button>
                    <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                      {editHookTarget ? "Save Changes" : "Add Hook"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={openAddHook}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-500/20 py-2.5 text-xs text-amber-500/60 transition hover:border-amber-500/40 hover:text-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Hook
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Encryption Settings Modal */}
      <Dialog open={!!encTarget} onOpenChange={(o) => { if (!o && !encSaving) setEncTarget(null); }}>
        <DialogContent
          className="max-w-md text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-lg font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Backup Encryption
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-slate-400 leading-relaxed">
            Encrypt your backups with AES-256 before uploading to storage. Even if your storage bucket is compromised, backups are unreadable without your password.
          </p>

          {encTarget?.encryption_enabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <Lock className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-300">Encryption is active</p>
                  <p className="mt-0.5 font-jetbrains text-[10px] text-emerald-400/70">Future backups will be AES-256 encrypted</p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 font-jetbrains text-[11px] text-amber-400">
                ⚠ Disabling will not re-encrypt or decrypt existing backups. They remain in their current state.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEncTarget(null)}
                  className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                  Cancel
                </button>
                <button onClick={() => handleSetEncryption(false)} disabled={encSaving}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                  {encSaving ? "Disabling…" : "Disable Encryption"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Encryption Password</Label>
                <Input
                  type="password"
                  value={encPassword}
                  onChange={(e) => setEncPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-emerald-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Confirm Password</Label>
                <Input
                  type="password"
                  value={encConfirm}
                  onChange={(e) => setEncConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-emerald-500/50"
                />
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 font-jetbrains text-[11px] text-red-400 leading-relaxed">
                ⚠ If you lose this password, your encrypted backups <strong>cannot be restored</strong>. We cannot recover it for you.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEncTarget(null)}
                  className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                  Cancel
                </button>
                <button
                  onClick={() => handleSetEncryption(true)}
                  disabled={encSaving || encPassword.length < 8 || encPassword !== encConfirm}
                  className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {encSaving ? "Enabling…" : "Enable Encryption"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog open={!!permsTarget} onOpenChange={(o) => { if (!o) setPermsTarget(null); }}>
        <DialogContent
          className="max-w-2xl text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              Connection Permissions — {permsTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {permsLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg bg-white/[0.04]" />)}
            </div>
          ) : permsList.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No org members found. Invite members first.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Member</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">View</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">Backup</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">Restore</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {permsList.map((perm, idx) => {
                    const isOwner = perm.role === "owner";
                    const saving = permsSaving === perm.org_member_id;
                    return (
                      <tr key={perm.org_member_id} className={`border-b border-white/[0.04] ${idx % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-200">{perm.name || perm.email}</span>
                            {perm.name && <span className="text-xs text-slate-500">{perm.email}</span>}
                          </div>
                          <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            perm.role === "owner" ? "bg-yellow-500/15 text-yellow-400" :
                            perm.role === "admin" ? "bg-purple-500/15 text-purple-400" :
                            "bg-slate-500/15 text-slate-400"
                          }`}>{perm.role}</span>
                        </td>
                        {(["can_view", "can_backup", "can_restore", "can_manage"] as const).map((field) => (
                          <td key={field} className="px-3 py-3 text-center">
                            {isOwner ? (
                              <Check className="mx-auto h-4 w-4 text-emerald-400" />
                            ) : (
                              <button
                                disabled={saving}
                                onClick={() => handlePermToggle(perm, field)}
                                className={`mx-auto flex h-6 w-6 items-center justify-center rounded transition ${
                                  perm[field]
                                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                    : "bg-white/[0.05] text-slate-600 hover:bg-white/[0.1] hover:text-slate-400"
                                } ${saving ? "opacity-40 cursor-wait" : ""}`}
                              >
                                {perm[field] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">Owners always have full access. Changes save immediately.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
