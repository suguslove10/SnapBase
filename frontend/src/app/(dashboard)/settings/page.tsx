"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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

export default function SettingsPage() {
  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [savingNotif, setSavingNotif] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  // Compliance
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);

  // Audit
  const [auditLogs, setAuditLogs] = useState<{ id: number; action: string; resource: string; ip_address: string; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Storage
  const [storageInfo, setStorageInfo] = useState<{
    total_backups: number;
    storage_used: number;
    minio_endpoint: string;
    bucket: string;
  } | null>(null);

  // User email
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    // Get user email from token
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserEmail(payload.email || "");
      } catch { /* ignore */ }
    }

    // Load notification settings
    api.get("/settings/notifications").then((res) => {
      const s = res.data;
      setNotifEnabled(s.notifications_enabled === "true");
      setSmtpHost(s.smtp_host || "");
      setSmtpPort(s.smtp_port || "587");
      setSmtpUsername(s.smtp_username || "");
      setSmtpPassword(s.smtp_password || "");
      setSmtpFrom(s.smtp_from || "");
      setSlackWebhook(s.slack_webhook_url || "");
    }).catch(() => {});

    // Load storage info
    api.get("/settings/storage").then((res) => setStorageInfo(res.data)).catch(() => {});

    // Load audit logs
    api.get("/audit?page=1").then((res) => { setAuditLogs(res.data.logs || []); setAuditLoading(false); }).catch(() => setAuditLoading(false));
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch("/auth/password", { current_password: currentPassword, new_password: newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to update password";
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleNotifSave = async () => {
    setSavingNotif(true);
    try {
      await api.patch("/settings/notifications", {
        smtp_host: smtpHost, smtp_port: smtpPort, smtp_username: smtpUsername,
        smtp_password: smtpPassword, smtp_from: smtpFrom, enabled: notifEnabled,
        slack_webhook_url: slackWebhook,
      });
      toast.success("Notification settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingNotif(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      await api.post("/settings/notifications/test");
      toast.success("Test email sent");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send test email";
      toast.error(msg);
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    try {
      await api.post("/settings/slack/test");
      toast.success("Test Slack message sent");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send Slack message";
      toast.error(msg);
    } finally {
      setTestingSlack(false);
    }
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
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${reportFrom}-to-${reportTo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Failed to generate report"); }
    finally { setGeneratingReport(false); }
  };

  const inputClass = "border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-0";

  return (
    <div className="space-y-8">
      <div className="relative">
        <div className="pointer-events-none absolute -top-8 left-0 right-0 h-32 bg-gradient-to-b from-amber-500/5 to-transparent" />
        <h1 className="relative text-3xl font-bold text-white">Settings</h1>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Profile</h2>
          <p className="text-sm text-slate-500">Manage your account credentials</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-400 text-xs uppercase tracking-wider">Email</Label>
            <Input value={userEmail} disabled className="border-white/10 bg-white/[0.02] text-slate-400 max-w-md" />
          </div>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">New Password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className={inputClass} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">Confirm Password</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={inputClass} />
              </div>
            </div>
            <Button type="submit" disabled={savingPassword} size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
              {savingPassword ? "Saving..." : "Update Password"}
            </Button>
          </form>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Email Notifications</h2>
              <p className="text-sm text-slate-500">Get alerted on backup success or failure</p>
            </div>
            <Switch checked={notifEnabled} onCheckedChange={setNotifEnabled} />
          </div>
        </div>
        {notifEnabled && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">SMTP Host</Label>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">SMTP Port</Label>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className={inputClass} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">Username</Label>
                <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">Password</Label>
                <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} className={inputClass} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-slate-400 text-xs uppercase tracking-wider">From Email</Label>
                <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="backups@yourcompany.com" className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleNotifSave} disabled={savingNotif} size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
                {savingNotif ? "Saving..." : "Save Settings"}
              </Button>
              <Button onClick={handleTestEmail} disabled={testingEmail} size="sm" variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
                {testingEmail ? "Sending..." : "Send Test Email"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Slack Section */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Slack Notifications</h2>
          <p className="text-sm text-slate-500">Get backup alerts in your Slack channel</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2 max-w-lg">
            <Label className="text-slate-400 text-xs uppercase tracking-wider">Webhook URL</Label>
            <Input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." className={inputClass} />
            <p className="text-[11px] text-slate-600">Create an incoming webhook in your Slack workspace settings.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={handleNotifSave} disabled={savingNotif} size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
              {savingNotif ? "Saving..." : "Save"}
            </Button>
            <Button onClick={handleTestSlack} disabled={testingSlack} size="sm" variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
              {testingSlack ? "Sending..." : "Send Test Message"}
            </Button>
          </div>
        </div>
      </div>

      {/* Storage Section */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Storage</h2>
          <p className="text-sm text-slate-500">MinIO object storage overview</p>
        </div>
        <div className="p-6">
          {storageInfo ? (
            <div className="grid grid-cols-2 gap-6 max-w-lg">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Total Backups</p>
                <p className="mt-1 text-2xl font-bold text-white">{storageInfo.total_backups}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Storage Used</p>
                <p className="mt-1 text-2xl font-bold text-white">{formatBytes(storageInfo.storage_used)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">MinIO Endpoint</p>
                <p className="mt-1 font-mono text-sm text-slate-300">{storageInfo.minio_endpoint}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Bucket</p>
                <p className="mt-1 font-mono text-sm text-slate-300">{storageInfo.bucket}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">Loading storage info...</p>
          )}
        </div>
      </div>

      {/* Compliance Report */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Compliance Report</h2>
          <p className="text-sm text-slate-500">Generate a PDF report for a date range</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-end gap-4 max-w-lg">
            <div className="space-y-2 flex-1">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">From</Label>
              <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-2 flex-1">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">To</Label>
              <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className={inputClass} />
            </div>
            <Button onClick={handleGenerateReport} disabled={generatingReport} size="sm" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shrink-0">
              {generatingReport ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* Audit Log Section */}
      <div className="rounded-xl border border-white/10 bg-[#1e293b] overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Audit Log</h2>
          <p className="text-sm text-slate-500">Recent activity in your account</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {auditLoading ? (
            <div className="p-6 text-sm text-slate-500">Loading...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No audit events yet.</div>
          ) : (
            auditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="flex items-center gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      log.action.includes("login") ? "bg-indigo-500/10 text-indigo-400" :
                      log.action.includes("backup") ? "bg-emerald-500/10 text-emerald-400" :
                      log.action.includes("connection") ? "bg-blue-500/10 text-blue-400" :
                      log.action.includes("schedule") ? "bg-violet-500/10 text-violet-400" :
                      "bg-white/5 text-slate-400"
                    }`}>{log.action}</span>
                    {log.resource && <span className="text-xs text-slate-500">{log.resource}</span>}
                  </div>
                </div>
                <span className="text-[11px] text-slate-600 shrink-0">{log.ip_address}</span>
                <span className="text-[11px] text-slate-600 shrink-0">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
