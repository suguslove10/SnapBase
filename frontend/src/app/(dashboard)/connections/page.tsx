"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Zap, Play, Database } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

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
  created_at: string;
}

interface StorageProvider {
  id: number;
  name: string;
  provider_type: string;
  is_default: boolean;
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

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean>>({});
  const [storageProviders, setStorageProviders] = useState<StorageProvider[]>([]);
  const [form, setForm] = useState({
    name: "", type: "postgres", host: "localhost", port: 5432,
    database: "", username: "", password: "", retention_days: 30, storage_provider_id: "",
  });

  const fetchConnections = () => {
    setLoading(true);
    api.get("/connections").then((res) => { setConnections(res.data); setLoading(false); });
  };

  useEffect(() => {
    fetchConnections();
    api.get("/storage-providers").then((res) => setStorageProviders(res.data));
  }, []);

  const handleTypeChange = (type: string) => {
    setForm({ ...form, type, port: defaultPorts[type] || 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setForm({ name: "", type: "postgres", host: "localhost", port: 5432, database: "", username: "", password: "", retention_days: 30, storage_provider_id: "" });
      fetchConnections();
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
    } catch {
      toast.error("Test failed");
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

  const isSqlite = form.type === "sqlite";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Connections</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your database connections</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.3)]"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              <Plus className="h-4 w-4" />
              Add Connection
            </button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg text-white"
            style={{ background: "#0d1526", border: "1px solid rgba(0,180,255,0.15)", borderRadius: "1.25rem" }}
          >
            <DialogHeader>
              <DialogTitle className="font-grotesk text-lg font-semibold text-white">Add Connection</DialogTitle>
            </DialogHeader>

            {/* IP whitelist reminder */}
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
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
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
                  <Input required value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className={inputClass} />
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-grotesk text-base font-semibold text-white">{conn.name}</h3>
                    {tested === true && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00ff88]" />
                      </span>
                    )}
                    {tested === false && (
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                      </span>
                    )}
                  </div>
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
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => handleTest(conn.id)}
                    disabled={testing === conn.id}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00b4ff]/30 hover:text-white disabled:opacity-50"
                  >
                    <Zap className="h-3 w-3" />
                    {testing === conn.id ? "Testing…" : "Test"}
                  </button>
                  <button
                    onClick={() => handleBackup(conn.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00f5d4]/30 hover:text-white"
                  >
                    <Play className="h-3 w-3" />
                    Backup
                  </button>
                  <button
                    onClick={() => handleDelete(conn.id)}
                    className="ml-auto rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
