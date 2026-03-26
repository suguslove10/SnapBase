"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { Users, UserPlus, Trash2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Member {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  role: string;
  joined_at: string;
}

interface Invite {
  id: number;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

const roleBadgeStyle: Record<string, string> = {
  owner:    "bg-[#00b4ff]/10 text-[#00b4ff] border-[#00b4ff]/20",
  admin:    "bg-purple-500/10 text-purple-400 border-purple-500/20",
  engineer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  viewer:   "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function TeamPage() {
  const { role, orgName, hasPermission } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("engineer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const canInvite = hasPermission("invite_members");
  const canManage = hasPermission("manage_members");

  const load = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        api.get("/org/members"),
        api.get("/org/invites"),
      ]);
      setMembers(membersRes.data);
      setInvites(invitesRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role && !hasPermission("view_members")) {
      router.push("/dashboard");
      return;
    }
    load();
  }, [role, hasPermission, load, router]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) { toast.error("Please fill in the email address"); return; }
    setInviteError("");
    setInviteSuccess("");
    setInviteLoading(true);
    try {
      await api.post("/org/invite", { email: inviteEmail, role: inviteRole });
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setInviteError(msg || "Failed to send invitation");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = async (memberId: number) => {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await api.delete(`/org/members/${memberId}`);
      load();
    } catch {
      // ignore
    }
  };

  const handleRoleChange = async (memberId: number, newRole: string) => {
    try {
      await api.put(`/org/members/${memberId}/role`, { role: newRole });
      load();
    } catch {
      // ignore
    }
  };

  const handleCancelInvite = async (inviteId: number) => {
    try {
      await api.delete(`/org/invites/${inviteId}`);
      load();
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(0,180,255,0.10)" }}>
            <Users className="h-5 w-5 text-[#00b4ff]" />
          </div>
          <div>
            <h1 className="font-grotesk text-xl font-bold text-white">Team</h1>
            {orgName && <p className="text-sm text-slate-500">{orgName}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Invite form */}
        {canInvite && (
          <div className="rounded-2xl border border-white/[0.08] p-6" style={{ background: "#0d1526" }}>
            <h2 className="mb-4 flex items-center gap-2 font-grotesk text-base font-semibold text-white">
              <UserPlus className="h-4 w-4 text-[#00b4ff]" />
              Invite Member
            </h2>
            <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Email address</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#00b4ff]/50 focus:ring-[#00b4ff]/20"
                />
              </div>
              <div className="w-40 space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Role</Label>
                <div className="relative">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-[#00b4ff]/50 focus:outline-none"
                  >
                    {role === "owner" && <option value="admin">Admin</option>}
                    <option value="engineer">Engineer</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              <button
                type="submit"
                disabled={inviteLoading}
                className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                {inviteLoading ? "Sending…" : "Send Invite"}
              </button>
            </form>
            {inviteError && (
              <p className="mt-3 text-sm text-red-400">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="mt-3 text-sm text-emerald-400">{inviteSuccess}</p>
            )}
          </div>
        )}

        {/* Members table */}
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: "#0d1526" }}>
          <div className="border-b border-white/[0.06] px-6 py-4">
            <h2 className="font-grotesk text-base font-semibold text-white">
              Members <span className="ml-1.5 font-jetbrains text-sm font-normal text-slate-500">{members.length}</span>
            </h2>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-slate-600">Loading…</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Member</th>
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Role</th>
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Joined</th>
                  {canManage && <th className="px-6 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-slate-400">
                            {(m.name || m.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-white">{m.name || m.email}</p>
                          {m.name && <p className="text-xs text-slate-500">{m.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {canManage && m.role !== "owner" ? (
                        <div className="relative w-32">
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value)}
                            className={`w-full appearance-none rounded-full border px-3 py-1 font-jetbrains text-[11px] font-semibold uppercase tracking-wider focus:outline-none ${roleBadgeStyle[m.role] ?? roleBadgeStyle.viewer}`}
                            style={{ background: "transparent" }}
                          >
                            <option value="admin">Admin</option>
                            <option value="engineer">Engineer</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                        </div>
                      ) : (
                        <span className={`rounded-full border px-2.5 py-0.5 font-jetbrains text-[11px] font-semibold uppercase tracking-wider ${roleBadgeStyle[m.role] ?? roleBadgeStyle.viewer}`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        {m.role !== "owner" && (
                          <button
                            onClick={() => handleRemove(m.id)}
                            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending invitations */}
        {canInvite && invites.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: "#0d1526" }}>
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h2 className="font-grotesk text-base font-semibold text-white">
                Pending Invitations <span className="ml-1.5 font-jetbrains text-sm font-normal text-slate-500">{invites.length}</span>
              </h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Email</th>
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Role</th>
                  <th className="px-6 py-3 text-left font-jetbrains text-[10px] uppercase tracking-wider text-slate-600">Expires</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-6 py-4 text-sm text-slate-300">{inv.email}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full border px-2.5 py-0.5 font-jetbrains text-[11px] font-semibold uppercase tracking-wider ${roleBadgeStyle[inv.role] ?? roleBadgeStyle.viewer}`}>
                        {inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleCancelInvite(inv.id)}
                        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
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
    </div>
  );
}
