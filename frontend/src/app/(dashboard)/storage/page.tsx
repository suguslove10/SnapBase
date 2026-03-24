"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  s3: "AWS S3",
  r2: "Cloudflare R2",
  b2: "Backblaze B2",
  spaces: "DigitalOcean Spaces",
  wasabi: "Wasabi",
  minio: "MinIO",
};

const providerColors: Record<string, string> = {
  s3: "border-l-orange-500",
  r2: "border-l-amber-500",
  b2: "border-l-red-500",
  spaces: "border-l-blue-500",
  wasabi: "border-l-green-500",
  minio: "border-l-violet-500",
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
  name: "",
  provider_type: "s3",
  endpoint: "",
  access_key: "",
  secret_key: "",
  bucket: "",
  region: "",
  use_ssl: true,
};

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
    api.get("/storage-providers").then((res) => {
      setProviders(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleTypeChange = (type: string) => {
    const hints = providerHints[type] || {};
    setForm({
      ...form,
      provider_type: type,
      endpoint: hints.endpoint || "",
      region: hints.region || "",
      use_ssl: type !== "minio",
    });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post("/storage-providers/test", {
        provider_type: form.provider_type,
        endpoint: form.endpoint,
        access_key: form.access_key,
        secret_key: form.secret_key,
        bucket: form.bucket,
        region: form.region,
        use_ssl: form.use_ssl,
      });
      if (res.data.success) {
        toast.success("Connection successful");
      } else {
        toast.error(res.data.error || "Connection failed");
      }
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/storage-providers", form);
      toast.success("Storage provider added");
      setOpen(false);
      setForm({ ...emptyForm });
      fetchProviders();
    } catch {
      toast.error("Failed to create provider");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this storage provider?")) return;
    try {
      await api.delete(`/storage-providers/${id}`);
      toast.success("Provider deleted");
      fetchProviders();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delete";
      toast.error(msg);
    }
  };

  const handleUpdateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.patch(`/storage-providers/${editId}/keys`, editKeys);
      toast.success("Keys updated");
      setEditId(null);
      setEditKeys({ access_key: "", secret_key: "" });
    } catch {
      toast.error("Failed to update keys");
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.patch(`/storage-providers/${id}/default`);
      toast.success("Default provider updated");
      fetchProviders();
    } catch {
      toast.error("Failed to set default");
    }
  };

  const needsEndpoint = ["r2", "b2", "minio"].includes(form.provider_type);
  const needsRegion = ["s3", "b2", "spaces", "wasabi"].includes(form.provider_type);
  const inputClass = "border-white/10 bg-white/5 text-white placeholder:text-slate-500";

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-violet-500/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Storage Providers</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500">
                <Plus className="mr-2 h-4 w-4" />Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent className="border-white/10 bg-[#1e293b] text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Storage Provider</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Name</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="My S3 Bucket" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Provider</Label>
                    <Select value={form.provider_type} onValueChange={handleTypeChange}>
                      <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#1e293b] text-white">
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
                    <div className="col-span-2 space-y-2">
                      <Label className="text-slate-400 text-xs uppercase tracking-wider">Endpoint</Label>
                      <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} className={inputClass} placeholder={providerHints[form.provider_type]?.endpoint || ""} />
                    </div>
                  )}
                  {needsRegion && (
                    <div className="space-y-2">
                      <Label className="text-slate-400 text-xs uppercase tracking-wider">Region</Label>
                      <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputClass} placeholder={providerHints[form.provider_type]?.region || ""} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Bucket</Label>
                    <Input required value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} className={inputClass} placeholder="my-backups" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Access Key</Label>
                    <Input required value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs uppercase tracking-wider">Secret Key</Label>
                    <Input required type="password" value={form.secret_key} onChange={(e) => setForm({ ...form, secret_key: e.target.value })} className={inputClass} />
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <Switch checked={form.use_ssl} onCheckedChange={(v) => setForm({ ...form, use_ssl: v })} />
                    <Label className="text-sm text-slate-400">Use SSL/TLS</Label>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !form.access_key || !form.secret_key || !form.bucket}
                    className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white">
                    <Zap className="mr-1 h-3.5 w-3.5" />{testing ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500">
                    Save Provider
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-[#1e293b] p-6">
              <Skeleton className="h-32 w-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#1e293b] py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <HardDrive className="h-7 w-7 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">No storage providers configured.</p>
          <p className="mt-1 text-xs text-slate-600">Add a provider to store your backups externally.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const borderClass = providerColors[p.provider_type] || "border-l-gray-500";
            return (
              <div key={p.id} className={`group rounded-xl border border-white/10 border-l-[3px] ${borderClass} bg-[#1e293b] p-5 transition-all hover:border-white/20 hover:shadow-lg hover:shadow-violet-500/5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{p.name}</h3>
                      {p.is_default && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] px-1.5">
                          <Star className="mr-0.5 h-2.5 w-2.5" />Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-600">
                      {providerLabels[p.provider_type] || p.provider_type}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-white/10 text-xs text-slate-500">
                    {p.use_ssl ? "SSL" : "No SSL"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-slate-500 font-mono truncate">
                    {p.bucket}
                  </p>
                  {p.endpoint && (
                    <p className="text-xs text-slate-600 font-mono truncate">
                      {p.endpoint}
                    </p>
                  )}
                  {p.region && (
                    <p className="text-[11px] text-slate-600">{p.region}</p>
                  )}
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  {!p.is_default && (
                    <Button size="sm" variant="outline" onClick={() => handleSetDefault(p.id)}
                      className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white text-xs h-8">
                      <Star className="mr-1 h-3 w-3" />Set Default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setEditId(p.id); setEditKeys({ access_key: "", secret_key: "" }); }}
                    className="border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white text-xs h-8">
                    <KeyRound className="mr-1 h-3 w-3" />Update Keys
                  </Button>
                  {!p.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}
                      className="ml-auto text-red-400/60 hover:bg-red-500/10 hover:text-red-400 h-8">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Update Keys Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="border-white/10 bg-[#1e293b] text-white max-w-sm">
          <DialogHeader><DialogTitle>Update Keys</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateKeys} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">Access Key</Label>
              <Input required value={editKeys.access_key} onChange={(e) => setEditKeys({ ...editKeys, access_key: e.target.value })}
                className="border-white/10 bg-white/5 text-white placeholder:text-slate-500" placeholder="AKIA..." />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">Secret Key</Label>
              <Input required type="password" value={editKeys.secret_key} onChange={(e) => setEditKeys({ ...editKeys, secret_key: e.target.value })}
                className="border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditId(null)} className="text-slate-400">Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-violet-600 to-indigo-600">Save Keys</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
