"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import api from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const sectionStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
  overflow: "hidden",
};

const inputClass = "rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#00b4ff]/50";

function SectionHeader({ title, desc, right }: { title: string; desc: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
      <div>
        <h2 className="font-grotesk text-sm font-semibold text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
      {right}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">{children}</Label>;
}

function PrimaryBtn({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-50"
      style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
    >
      {children}
    </button>
  );
}

function OutlineBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [savingNotif, setSavingNotif] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [auditLogs, setAuditLogs] = useState<{ id: number; user_id: number; user_email: string; action: string; resource: string; resource_id: number; metadata: string; ip_address: string; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [storageInfo, setStorageInfo] = useState<{ total_backups: number; storage_used: number; minio_endpoint: string; bucket: string } | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserEmail(payload.email || "");
      } catch { /* ignore */ }
    }
    api.get("/settings/notifications").then((res) => {
      const s = res.data;
      setNotifEnabled(s.notifications_enabled === "true");
      setSmtpHost(s.smtp_host || ""); setSmtpPort(s.smtp_port || "587");
      setSmtpUsername(s.smtp_username || ""); setSmtpPassword(s.smtp_password || "");
      setSmtpFrom(s.smtp_from || ""); setSlackWebhook(s.slack_webhook_url || ""); setDiscordWebhook(s.discord_webhook_url || "");
    }).catch(() => {});
    api.get("/settings/storage").then((res) => setStorageInfo(res.data)).catch(() => {});
    api.get("/audit?page=1").then((res) => { setAuditLogs(res.data.logs || []); setAuditLoading(false); }).catch(() => setAuditLoading(false));
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) { toast.error("Please fill in your current password"); return; }
    if (!newPassword) { toast.error("Please fill in your new password"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSavingPassword(true);
    try {
      await api.patch("/auth/password", { current_password: currentPassword, new_password: newPassword });
      toast.success("Password updated");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to update password");
    } finally { setSavingPassword(false); }
  };

  const handleNotifSave = async () => {
    setSavingNotif(true);
    try {
      await api.patch("/settings/notifications", {
        smtp_host: smtpHost, smtp_port: smtpPort, smtp_username: smtpUsername,
        smtp_password: smtpPassword, smtp_from: smtpFrom, enabled: notifEnabled,
        slack_webhook_url: slackWebhook,
        discord_webhook_url: discordWebhook,
      });
      toast.success("Notification settings saved");
    } catch { toast.error("Failed to save settings"); }
    finally { setSavingNotif(false); }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      await api.post("/settings/notifications/test");
      toast.success("Test email sent");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send test email");
    } finally { setTestingEmail(false); }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    try {
      await api.post("/settings/slack/test");
      toast.success("Test Slack message sent");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send Slack message");
    } finally { setTestingSlack(false); }
  };

  const handleTestDiscord = async () => {
    setTestingDiscord(true);
    try {
      await api.post("/settings/discord/test");
      toast.success("Test Discord message sent");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send Discord message");
    } finally { setTestingDiscord(false); }
  };

  const handleGenerateReport = async () => {
    if (!reportFrom || !reportTo) { toast.error("Select a date range"); return; }
    setGeneratingReport(true);
    try {
      const token = localStorage.getItem("token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
      const res = await fetch(`${baseUrl}/reports/compliance`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: reportFrom, to: reportTo }),
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `compliance-${reportFrom}-${reportTo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Failed to generate report"); }
    finally { setGeneratingReport(false); }
  };

  const auditActionColor = (action: string) => {
    if (action.includes("login") || action.includes("registered")) return { bg: "rgba(0,180,255,0.10)", color: "#00b4ff" };
    if (action.includes("backup.triggered")) return { bg: "rgba(0,255,136,0.10)", color: "#00ff88" };
    if (action.includes("backup.restored")) return { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" };
    if (action.includes("connection.created")) return { bg: "rgba(56,189,248,0.10)", color: "#38bdf8" };
    if (action.includes("connection.deleted")) return { bg: "rgba(248,113,113,0.10)", color: "#f87171" };
    if (action.includes("schedule")) return { bg: "rgba(167,139,250,0.10)", color: "#a78bfa" };
    if (action.includes("encryption")) return { bg: "rgba(0,245,212,0.10)", color: "#00f5d4" };
    return { bg: "rgba(255,255,255,0.05)", color: "#64748b" };
  };

  const auditDetail = (log: { action: string; resource: string; resource_id: number; metadata: string }) => {
    try {
      const meta = JSON.parse(log.metadata || "{}");
      if (log.action === "backup.triggered") return meta.name ? `Backup of "${meta.name}"` : "Manual backup triggered";
      if (log.action === "backup.restored") return `Restore of backup #${meta.backup_id || log.resource_id}`;
      if (log.action === "connection.created") return `"${meta.name}" (${meta.type}) — ${meta.host}/${meta.database}`;
      if (log.action === "connection.deleted") return `Connection #${meta.id || log.resource_id} deleted`;
      if (log.action === "schedule.created") return `Cron: ${meta.cron} on connection #${meta.connection_id}`;
      if (log.action === "schedule.deleted") return `Schedule #${meta.id || log.resource_id} deleted`;
      if (log.action === "encryption.enabled") return `Encryption enabled on connection #${log.resource_id}`;
      if (log.action === "encryption.disabled") return `Encryption disabled on connection #${log.resource_id}`;
      if (log.action === "user.oauth_login") return `OAuth via ${meta.provider || "unknown provider"}`;
      if (log.action === "user.login") return "Password login";
      if (log.action === "user.registered") return "Account created";
      if (meta.name) return meta.name;
    } catch { /* ignore */ }
    return log.resource || "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-grotesk text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Account, notifications, and compliance</p>
      </div>

      {/* Profile */}
      <div style={sectionStyle}>
        <SectionHeader title="Profile" desc="Manage your account credentials" />
        <div className="space-y-5 p-6">
          <div className="space-y-1.5 max-w-md">
            <FieldLabel>Email</FieldLabel>
            <Input value={userEmail} disabled className="rounded-xl border-white/[0.06] bg-white/[0.02] text-slate-500" />
          </div>
          <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <FieldLabel>Current Password</FieldLabel>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>New Password</FieldLabel>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Confirm Password</FieldLabel>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
              </div>
            </div>
            <PrimaryBtn disabled={savingPassword}>{savingPassword ? "Saving…" : "Update Password"}</PrimaryBtn>
          </form>
        </div>
      </div>

      {/* Email Notifications */}
      <div style={sectionStyle}>
        <SectionHeader
          title="Email Notifications"
          desc="Get alerted on backup success or failure"
          right={<Switch checked={notifEnabled} onCheckedChange={setNotifEnabled} />}
        />
        {notifEnabled && (
          <div className="space-y-4 p-6">
            <div className="grid max-w-lg grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>SMTP Host</FieldLabel>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>SMTP Port</FieldLabel>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Username</FieldLabel>
                <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Password</FieldLabel>
                <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} className={inputClass} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel>From Email</FieldLabel>
                <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="backups@company.com" className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3">
              <PrimaryBtn onClick={handleNotifSave} disabled={savingNotif}>{savingNotif ? "Saving…" : "Save Settings"}</PrimaryBtn>
              <OutlineBtn onClick={handleTestEmail} disabled={testingEmail}>{testingEmail ? "Sending…" : "Send Test Email"}</OutlineBtn>
            </div>
          </div>
        )}
      </div>

      {/* Slack */}
      <div style={sectionStyle}>
        <SectionHeader title="Slack Notifications" desc="Get backup alerts in your Slack channel" />
        <div className="space-y-4 p-6">
          <div className="max-w-lg space-y-1.5">
            <FieldLabel>Webhook URL</FieldLabel>
            <Input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/…" className={inputClass} />
            <p className="font-jetbrains text-[11px] text-slate-600">Create an incoming webhook in your Slack workspace settings.</p>
          </div>
          <div className="flex gap-3">
            <PrimaryBtn onClick={handleNotifSave} disabled={savingNotif}>{savingNotif ? "Saving…" : "Save"}</PrimaryBtn>
            <OutlineBtn onClick={handleTestSlack} disabled={testingSlack}>{testingSlack ? "Sending…" : "Send Test Message"}</OutlineBtn>
          </div>
        </div>
      </div>

      {/* Discord */}
      <div style={sectionStyle}>
        <SectionHeader title="Discord Notifications" desc="Get backup alerts in your Discord server" />
        <div className="space-y-4 p-6">
          <div className="max-w-lg space-y-1.5">
            <FieldLabel>Webhook URL</FieldLabel>
            <Input value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className={inputClass} />
            <p className="font-jetbrains text-[11px] text-slate-600">Create a webhook in Discord: Server Settings → Integrations → Webhooks.</p>
          </div>
          <div className="flex gap-3">
            <PrimaryBtn onClick={handleNotifSave} disabled={savingNotif}>{savingNotif ? "Saving…" : "Save"}</PrimaryBtn>
            <OutlineBtn onClick={handleTestDiscord} disabled={testingDiscord}>{testingDiscord ? "Sending…" : "Send Test Message"}</OutlineBtn>
          </div>
        </div>
      </div>

      {/* Storage overview */}
      <div style={sectionStyle}>
        <SectionHeader title="Storage" desc="Default MinIO object storage overview" />
        <div className="p-6">
          {storageInfo ? (
            <div className="grid max-w-lg grid-cols-2 gap-5">
              {[
                { label: "Total Backups", value: storageInfo.total_backups.toString() },
                { label: "Storage Used", value: formatBytes(storageInfo.storage_used) },
                { label: "MinIO Endpoint", value: storageInfo.minio_endpoint, mono: true },
                { label: "Bucket", value: storageInfo.bucket, mono: true },
              ].map((item) => (
                <div key={item.label}>
                  <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-600">{item.label}</p>
                  <p className={`mt-1 text-sm font-semibold text-white ${item.mono ? "font-jetbrains" : "font-grotesk"}`}>{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
        </div>
      </div>

      {/* Compliance Report */}
      <div style={sectionStyle}>
        <SectionHeader title="Compliance Report" desc="Generate a PDF report for a date range" />
        <div className="p-6">
          <div className="flex max-w-lg items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel>From</FieldLabel>
              <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1 space-y-1.5">
              <FieldLabel>To</FieldLabel>
              <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className={inputClass} />
            </div>
            <PrimaryBtn onClick={handleGenerateReport} disabled={generatingReport}>
              {generatingReport ? "Generating…" : "Generate PDF"}
            </PrimaryBtn>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div style={sectionStyle}>
        <SectionHeader title="Audit Log" desc="Recent activity in your account" />
        <div className="divide-y divide-white/[0.04]">
          {auditLoading ? (
            <div className="p-6 font-jetbrains text-xs text-slate-600">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">No audit events yet.</div>
          ) : (
            auditLogs.slice(0, 50).map((log) => {
              const { bg, color } = auditActionColor(log.action);
              const detail = auditDetail(log);
              return (
                <div key={log.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-0.5 px-6 py-3 transition hover:bg-white/[0.02]">
                  {/* Action badge */}
                  <span
                    className="rounded-lg px-1.5 py-0.5 font-jetbrains text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ background: bg, color }}
                  >
                    {log.action}
                  </span>

                  {/* Detail + actor */}
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-300">{detail}</p>
                    <p className="font-jetbrains text-[10px] text-slate-600 truncate">
                      {log.user_email || `user #${log.user_id}`}
                    </p>
                  </div>

                  {/* IP */}
                  <span className="font-jetbrains text-[10px] text-slate-600 shrink-0 text-right">{log.ip_address}</span>

                  {/* Timestamp */}
                  <span className="font-jetbrains text-[10px] text-slate-500 shrink-0 text-right whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
