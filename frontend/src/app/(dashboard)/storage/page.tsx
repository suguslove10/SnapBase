"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Zap, Star, HardDrive, KeyRound } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

interface StorageProvider {
  id: number;
  name: string;
  provider_type: string;
  endpoint: string;
  access_key: string;
  bucket: string;
  region: string;
  use_ssl: boolean;
  is_default: boolean;
  created_at: string;
}

const providerLabels: Record<string, string> = {
  s3: "AWS S3", r2: "Cloudflare R2", b2: "Backblaze B2",
  spaces: "DigitalOcean Spaces", wasabi: "Wasabi", minio: "MinIO",
};

const providerColors: Record<string, string> = {
  s3: "#ff9500", r2: "#f59e0b", b2: "#f87171",
  spaces: "#00b4ff", wasabi: "#00ff88", minio: "#a78bfa",
};

const providerHints: Record<string, { endpoint?: string; region?: string }> = {
  s3: { region: "us-east-1" },
  r2: { endpoint: "<account-id>.r2.cloudflarestorage.com" },
  b2: { endpoint: "s3.us-west-004.backblazeb2.com", region: "us-west-004" },
  spaces: { region: "nyc3" },
  wasabi: { region: "us-east-1" },
  minio: { endpoint: "localhost:9000" },
};

const emptyForm = {
  name: "", provider_type: "s3", endpoint: "", access_key: "",
  secret_key: "", bucket: "", region: "", use_ssl: true,
};

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

const inputClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#00b4ff]/50";
const selectClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white";

export default function StoragePage() {
  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [editKeys, setEditKeys] = useState({ access_key: "", secret_key: "" });

  const fetchProviders = () => {
    setLoading(true);
    api.get("/storage-providers").then((res) => { setProviders(res.data); setLoading(false); });
  };

  useEffect(() => { fetchProviders(); }, []);

  const handleTypeChange = (type: string) => {
    const hints = providerHints[type] || {};
    setForm({ ...form, provider_type: type, endpoint: hints.endpoint || "", region: hints.region || "", use_ssl: type !== "minio" });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post("/storage-providers/test", {
        provider_type: form.provider_type, endpoint: form.endpoint,
        access_key: form.access_key, secret_key: form.secret_key,
        bucket: form.bucket, region: form.region, use_ssl: form.use_ssl,
      });
      if (res.data.success) toast.success("Connection successful");
      else toast.error(res.data.error || "Connection failed");
    } catch { toast.error("Test failed"); }
    finally { setTesting(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Please fill in the provider name"); return; }
    if (!form.bucket.trim()) { toast.error("Please fill in the bucket name"); return; }
    if (!form.access_key.trim()) { toast.error("Please fill in the access key"); return; }
    if (!form.secret_key.trim()) { toast.error("Please fill in the secret key"); return; }
    try {
      await api.post("/storage-providers", form);
      toast.success("Storage provider added");
      setOpen(false); setForm({ ...emptyForm }); fetchProviders();
    } catch { toast.error("Failed to create provider"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this storage provider?")) return;
    try {
      await api.delete(`/storage-providers/${id}`);
      toast.success("Provider deleted"); fetchProviders();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delete";
      toast.error(msg);
    }
  };

  const handleUpdateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKeys.access_key.trim()) { toast.error("Please fill in the access key"); return; }
    if (!editKeys.secret_key.trim()) { toast.error("Please fill in the secret key"); return; }
    try {
      await api.patch(`/storage-providers/${editId}/keys`, editKeys);
      toast.success("Keys updated");
      setEditId(null); setEditKeys({ access_key: "", secret_key: "" });
    } catch { toast.error("Failed to update keys"); }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.patch(`/storage-providers/${id}/default`);
      toast.success("Default provider updated"); fetchProviders();
    } catch { toast.error("Failed to set default"); }
  };

  const needsEndpoint = ["r2", "b2", "minio"].includes(form.provider_type);
  const needsRegion = ["s3", "b2", "spaces", "wasabi"].includes(form.provider_type);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-white">Storage Providers</h1>
          <p className="mt-1 text-sm text-slate-500">Manage where your backups are stored</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.3)] whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              <Plus className="h-4 w-4" />Add Provider
            </button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg text-white"
            style={{ background: "#0d1526", border: "1px solid rgba(0,180,255,0.15)", borderRadius: "1.25rem" }}
          >
            <DialogHeader>
              <DialogTitle className="font-grotesk text-lg font-semibold text-white">Add Storage Provider</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="My S3 Bucket" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Provider</Label>
                  <Select value={form.provider_type} onValueChange={handleTypeChange}>
                    <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <SelectItem value="s3">AWS S3</SelectItem>
                      <SelectItem value="r2">Cloudflare R2</SelectItem>
                      <SelectItem value="b2">Backblaze B2</SelectItem>
                      <SelectItem value="spaces">DigitalOcean Spaces</SelectItem>
                      <SelectItem value="wasabi">Wasabi</SelectItem>
                      <SelectItem value="minio">MinIO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {needsEndpoint && (
                  <div className="col-span-2 space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Endpoint</Label>
                    <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} className={inputClass} placeholder={providerHints[form.provider_type]?.endpoint || ""} />
                  </div>
                )}
                {needsRegion && (
                  <div className="space-y-1.5">
                    <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Region</Label>
                    <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputClass} placeholder={providerHints[form.provider_type]?.region || ""} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Bucket</Label>
                  <Input value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} className={inputClass} placeholder="my-backups" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Access Key</Label>
                  <Input value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Secret Key</Label>
                  <Input type="password" value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} className={inputClass} />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <Switch checked={form.use_ssl} onCheckedChange={(v) => setForm({ ...form, use_ssl: v })} />
                  <Label className="text-sm text-slate-400">Use SSL/TLS</Label>
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !form.access_key || !form.secret_key || !form.bucket}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-[#00b4ff]/30 hover:text-white disabled:opacity-40"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {testing ? "Testing…" : "Test Connection"}
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
                >
                  Save Provider
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-6" style={cardStyle}>
              <Skeleton className="h-32 w-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <HardDrive className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No storage providers configured.</p>
          <p className="mt-1 text-xs text-slate-600">Add a provider to store your backups externally.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const color = providerColors[p.provider_type] || "#94a3b8";
            return (
              <div
                key={p.id}
                className="group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                style={{ ...cardStyle, borderLeft: `3px solid ${color}40` }}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-grotesk text-base font-semibold text-white truncate">{p.name}</h3>
                      {p.is_default && (
                        <span
                          className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-jetbrains text-[10px] font-semibold"
                          style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
                        >
                          <Star className="h-2.5 w-2.5" />Default
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-jetbrains text-[10px] uppercase tracking-widest" style={{ color }}>
                      {providerLabels[p.provider_type] || p.provider_type}
                    </p>
                  </div>
                  <span
                    className="rounded-lg px-2 py-0.5 font-jetbrains text-[10px]"
                    style={{ background: "rgba(255,255,255,0.04)", color: p.use_ssl ? "#00ff88" : "#64748b" }}
                  >
                    {p.use_ssl ? "SSL" : "No SSL"}
                  </span>
                </div>

                <div className="mt-3 space-y-1">
                  <p className="font-jetbrains text-[11px] text-slate-500 truncate">{p.bucket}</p>
                  {p.endpoint && <p className="font-jetbrains text-[11px] text-slate-600 truncate">{p.endpoint}</p>}
                  {p.region && <p className="font-jetbrains text-[11px] text-slate-600">{p.region}</p>}
                  {p.access_key && <p className="font-jetbrains text-[11px] text-slate-700 truncate">{p.access_key}</p>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!p.is_default && (
                    <button
                      onClick={() => handleSetDefault(p.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-yellow-500/30 hover:text-yellow-400"
                    >
                      <Star className="h-3 w-3" />Set Default
                    </button>
                  )}
                  <button
                    onClick={() => { setEditId(p.id); setEditKeys({ access_key: "", secret_key: "" }); }}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-[#00b4ff]/30 hover:text-white"
                  >
                    <KeyRound className="h-3 w-3" />Update Keys
                  </button>
                  {!p.is_default && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="ml-auto rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Update Keys Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent
          className="max-w-sm text-white"
          style={{ background: "#0d1526", border: "1px solid rgba(0,180,255,0.15)", borderRadius: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle className="font-grotesk text-base font-semibold text-white">Update Keys</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateKeys} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Access Key</Label>
              <Input value={editKeys.access_key} onChange={(e) => setEditKeys({ ...editKeys, access_key: e.target.value })}
                className={inputClass} placeholder="AKIA…" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">Secret Key</Label>
              <Input type="password" value={editKeys.secret_key} onChange={(e) => setEditKeys({ ...editKeys, secret_key: e.target.value })}
                className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditId(null)}
                className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white">
                Cancel
              </button>
              <button type="submit"
                className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}>
                Save Keys
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
