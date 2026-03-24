"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Zap, Database } from "lucide-react";
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

const defaultPorts: Record<string, number> = { postgres: 5432, mysql: 3306, mongodb: 27017, sqlite: 0 };

const dbBorders: Record<string, string> = {
  postgres: "border-l-blue-500",
  mysql: "border-l-orange-500",
  mongodb: "border-l-green-500",
  sqlite: "border-l-gray-400",
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean>>({});
  const [storageProviders, setStorageProviders] = useState<StorageProvider[]>([]);
  const [form, setForm] = useState({
    name: "", type: "postgres", host: "localhost", port: 5432, database: "", username: "", password: "", retention_days: 30, storage_provider_id: "",
  });

  const fetchConnections = () => {
    setLoading(true);
    api.get("/connections").then((res) => { setConnections(res.data); setLoading(false); });
  };
  useEffect(() => {
    fetchConnections();
    api.get("/storage-providers").then((res) => setStorageProviders(res.data));
  }, []);

  const handleTypeChange = (type: string) => { setForm({ ...form, type, port: defaultPorts[type] || 0 }); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        storage_provider_id: (form.storage_provider_id && form.storage_provider_id !== "default") ? parseInt(form.storage_provider_id) : null,
      };
      await api.post("/connections", payload);
      toast.success("Connection created");
      setOpen(false);
      setForm({ name: "", type: "postgres", host: "localhost", port: 5432, database: "", username: "", password: "", retention_days: 30, storage_provider_id: "" });
      fetchConnections();
    } catch { toast.error("Failed to create connection"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this connection?")) return;
    try { await api.delete(`/connections/${id}`); toast.success("Connection deleted"); fetchConnections(); }
    catch { toast.error("Failed to delete connection"); }
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
    }
    finally { setTesting(null); }
  };

  const handleBackup = async (id: number) => {
    try { await api.post(`/backups/trigger/${id}`); toast.success("Backup triggered"); }
    catch { toast.error("Failed to trigger backup"); }
  };

  const isSqlite = form.type === "sqlite";
  const inputClass = "border-white/10 bg-white/5 text-white placeholder:text-slate-500";

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Connections</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
                <Plus className="mr-2 h-4 w-4" />Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent className="border-white/10 bg-[#1e293b] text-white max-w-lg">
              <DialogHeader><DialogTitle>Add Connection</DialogTitle></DialogHeader>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Allow this IP in your database firewall/whitelist:{" "}
                <span className="font-mono font-bold select-all">161.118.183.218</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Name</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Type</Label>
                    <Select value={form.type} onValueChange={handleTypeChange}>
                      <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#1e293b] text-white">
                        <SelectItem value="postgres">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                        <SelectItem value="sqlite">SQLite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!isSqlite && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-xs uppercase tracking-wider">Host</Label>
                        <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className={inputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-xs uppercase tracking-wider">Port</Label>
                        <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })} className={inputClass} />
                      </div>
                    </>
                  )}
                  <div className="col-span-2 space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">{isSqlite ? "File Path" : "Database"}</Label>
                    <Input required value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className={inputClass} />
                  </div>
                  {!isSqlite && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-xs uppercase tracking-wider">Username</Label>
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-400 text-xs uppercase tracking-wider">Password</Label>
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Retention</Label>
                    <Select value={form.retention_days.toString()} onValueChange={(v) => setForm({ ...form, retention_days: parseInt(v) })}>
                      <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#1e293b] text-white">
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
                    <div className="space-y-2">
                      <Label className="text-slate-400 text-xs uppercase tracking-wider">Storage</Label>
                      <Select value={form.storage_provider_id} onValueChange={(v) => setForm({ ...form, storage_provider_id: v })}>
                        <SelectTrigger className={inputClass}><SelectValue placeholder="Default" /></SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#1e293b] text-white">
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
                <div className="flex justify-end">
                  <Button type="submit" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">Save Connection</Button>
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
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#1e293b] py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Database className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No connections yet.</p>
          <p className="mt-1 text-xs text-slate-600">Click &ldquo;Add Connection&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => {
            const borderClass = dbBorders[conn.type] || "border-l-gray-500";
            const tested = testResults[conn.id];
            return (
              <div key={conn.id} className={`group rounded-xl border border-white/10 border-l-[3px] ${borderClass} bg-[#1e293b] p-5 transition-all hover:border-white/20 hover:shadow-lg hover:shadow-indigo-500/5`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{conn.name}</h3>
                    {tested === true && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="border-white/10 text-xs text-slate-500">
                    {conn.retention_days > 0 ? `${conn.retention_days}d` : "forever"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  {conn.type === "sqlite" ? conn.database : `${conn.host}:${conn.port}/${conn.database}`}
                </p>
                <div className="mt-1">
                  <span className="text-[11px] uppercase tracking-wider text-slate-600">{conn.type}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleTest(conn.id)} disabled={testing === conn.id}
                    className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white text-xs h-8">
                    <Zap className="mr-1 h-3 w-3" />{testing === conn.id ? "..." : "Test"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBackup(conn.id)}
                    className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white text-xs h-8">
                    Backup
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(conn.id)}
                    className="ml-auto text-red-400/60 hover:bg-red-500/10 hover:text-red-400 h-8">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
