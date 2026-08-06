"use client";

import { useState, useEffect } from "react";
import { GitBranch, Plus, Trash2, RefreshCw, Layers, ShieldCheck, Terminal } from "lucide-react";
import api from "@/lib/api";

interface DBConnection {
  id: number;
  name: string;
  type: string;
  database: string;
}

interface BranchItem {
  id: number;
  connection_id: number;
  name: string;
  type: string;
  branch_name: string;
  status: string;
  created_at: string;
  database_url?: string;
}

export default function BranchingPage() {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [branchNameInput, setBranchNameInput] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [branchRes, connRes] = await Promise.all([
        api.get("/branching"),
        api.get("/connections"),
      ]);
      setBranches(branchRes.data.branches || []);
      setConnections(connRes.data || []);
    } catch {
      setErrorMsg("Failed to load branching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnId || !branchNameInput.trim()) return;

    setProvisioning(true);
    setErrorMsg("");
    try {
      await api.post("/branching/create", {
        connection_id: parseInt(selectedConnId),
        branch_name: branchNameInput.trim(),
      });
      setShowModal(false);
      setBranchNameInput("");
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setErrorMsg(error.response?.data?.error || "Failed to provision branch");
    } finally {
      setProvisioning(false);
    }
  };

  const handleDeleteBranch = async (name: string) => {
    if (!confirm(`Are you sure you want to tear down preview branch "${name}"?`)) return;
    try {
      await api.delete(`/branching/${name}`);
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      alert(error.response?.data?.error || "Failed to delete branch");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-grotesk text-2xl font-bold text-white">DB Preview Branching</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00b4ff]/30 bg-[#00b4ff]/10 px-3 py-1 font-jetbrains text-xs font-semibold text-[#00b4ff]">
              <SparklesIcon className="h-3.5 w-3.5" />
              Copy-on-Write Ephemeral
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Provision isolated preview database branches for PR testing and preview environments.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00b4ff] to-[#0077ff] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#00b4ff]/20 transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Provision Preview Branch
        </button>
      </div>

      {/* Feature Info Card */}
      <div className="rounded-2xl border border-white/[0.08] p-5" style={{ background: "rgba(15, 23, 42, 0.6)" }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#00b4ff]/30 bg-[#00b4ff]/10 p-3 text-[#00b4ff]">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Automated GitHub Pull Request Integration</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                The GitHub Action workflow <code className="rounded bg-white/10 px-1.5 py-0.5 text-[#00b4ff]">.github/workflows/snapbase-sync.yml</code> automatically provisions a preview branch on PR open and tears it down on PR merge.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-jetbrains text-slate-400">
            <Terminal className="h-4 w-4 text-[#00b4ff]" />
            CLI: <code className="text-white">snapbase branch create --name pr-42</code>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Active Branches Table */}
      <div className="rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: "#080d1a" }}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="font-semibold text-white">Active Preview Branches</h2>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading preview branches...</div>
        ) : branches.length === 0 ? (
          <div className="p-12 text-center">
            <GitBranch className="mx-auto h-12 w-12 text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-300">No active preview branches</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Provision a database preview branch manually or trigger automated branching via PR in GitHub.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Branch Name</th>
                  <th className="px-6 py-3.5">Engine</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-6 py-4 font-mono font-semibold text-white flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-[#00b4ff]" />
                      {b.branch_name || b.name}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono uppercase text-slate-400">{b.type}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="h-3 w-3" />
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteBranch(b.branch_name || b.name)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition rounded-lg hover:bg-white/[0.06]"
                        title="Teardown Branch"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ background: "#0c1322" }}>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-grotesk text-lg font-bold text-white flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-[#00b4ff]" />
                Provision Preview Branch
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateBranch} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Source Connection</label>
                <select
                  value={selectedConnId}
                  onChange={(e) => setSelectedConnId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white focus:border-[#00b4ff] focus:outline-none"
                  required
                >
                  <option value="">Select source database...</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type} - {c.database})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Branch Identifier (e.g. pr-42)</label>
                <input
                  type="text"
                  placeholder="e.g. pr-42 or feature-auth"
                  value={branchNameInput}
                  onChange={(e) => setBranchNameInput(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white focus:border-[#00b4ff] focus:outline-none font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={provisioning}
                  className="rounded-xl bg-gradient-to-r from-[#00b4ff] to-[#0077ff] px-5 py-2 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50"
                >
                  {provisioning ? "Provisioning..." : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
    </svg>
  );
}
