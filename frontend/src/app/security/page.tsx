import Link from "next/link";
import { ShieldCheck, Lock, Globe, Database, FileText, Mail } from "lucide-react";

const sections = [
  {
    icon: Lock,
    title: "Credential Protection",
    color: "#00ff88",
    items: [
      "AES-256-GCM encryption for all database passwords at rest",
      "Credentials masked in the UI after saving — the plaintext never comes back",
      "Credentials are never written to application logs",
      "Passwords are decrypted in memory only at the moment a backup runs, then discarded",
      "Separate ENCRYPTION_KEY from your database password — compromise one, not both",
    ],
  },
  {
    icon: Globe,
    title: "Data in Transit",
    color: "#00b4ff",
    items: [
      "All API communication served over HTTPS/TLS in production",
      "Database connections use SSL where the target supports it",
      "MinIO and S3-compatible storage connections use HTTPS",
      "JWT tokens signed with HS256 and expire after 24 hours",
    ],
  },
  {
    icon: Database,
    title: "Your Data, Your Control",
    color: "#a78bfa",
    items: [
      "We never read, scan, or process the contents of your backup files",
      "Backup files land directly in YOUR storage bucket — we are only a conduit",
      "Delete a connection and its credentials are permanently gone",
      "Full audit log of every action: who did what, when, from which IP",
      "Retention policies let you auto-delete old backups on your own schedule",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Open Source & Self-Hostable",
    color: "#00f5d4",
    items: [
      "Fully open source — read every line of code on GitHub",
      "Self-host on your own infrastructure with Docker Compose in under 5 minutes",
      "No vendor lock-in: your data stays in the storage bucket you already own",
      "Don't trust us? Run it yourself and never send us a single credential",
    ],
  },
  {
    icon: FileText,
    title: "Compliance Ready",
    color: "#fbbf24",
    items: [
      "Generate signed PDF compliance reports for any date range, on demand",
      "Audit logs provide a complete immutable trail for SOC 2 / ISO 27001 reviews",
      "Backup verification confirms integrity without touching production data",
      "Anomaly detection flags unusual backup sizes before they become incidents",
    ],
  },
  {
    icon: Mail,
    title: "Responsible Disclosure",
    color: "#f87171",
    items: [
      "Found a vulnerability? Email security@getsnapbase.com",
      "We triage all security reports within 48 hours",
      "We will never take legal action against good-faith security researchers",
      "Critical fixes are patched and released as a priority",
    ],
  },
];

const cardStyle = {
  background: "rgba(13,21,38,0.8)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "1rem",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1e" }}>
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 border-b border-white/[0.06]"
        style={{ background: "rgba(10,15,30,0.85)", backdropFilter: "blur(16px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-black text-[#0a0f1e]" style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}>SB</div>
            <span className="font-grotesk text-base font-semibold text-white">SnapBase</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</Link>
            <Link href="/security" className="text-sm text-[#00b4ff]">Security</Link>
            <Link
              href="/login"
              className="rounded-xl px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pb-8 pt-20 text-center">
        {/* Glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: "rgba(0,255,136,0.06)" }} />

        <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00ff88]/20 bg-[#00ff88]/10">
          <ShieldCheck className="h-8 w-8 text-[#00ff88]" />
        </div>
        <h1 className="font-grotesk text-4xl font-bold text-white md:text-5xl">
          Security <span style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>First</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
          You&apos;re trusting us with credentials to your most important data.
          Here&apos;s exactly how we protect them.
        </p>
      </section>

      {/* Trust bar */}
      <div className="mx-auto mb-16 max-w-3xl border-y border-white/[0.06] py-5">
        <div className="flex flex-wrap items-center justify-center gap-6 font-jetbrains text-xs text-slate-400">
          {["AES-256-GCM at rest", "TLS in transit", "Zero credential logging", "Open source"].map((item) => (
            <span key={item} className="flex items-center gap-1.5">
              <span className="text-[#00ff88]">✓</span> {item}
            </span>
          ))}
        </div>
      </div>

      {/* Sections grid */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
              style={{ ...cardStyle, borderLeft: `3px solid ${s.color}40` }}
            >
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}
              >
                <s.icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <h3 className="mb-4 font-grotesk text-base font-semibold text-white">{s.title}</h3>
              <ul className="space-y-2">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2 font-jetbrains text-[11px] leading-relaxed text-slate-400">
                    <span className="mt-0.5 shrink-0" style={{ color: s.color }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-black text-[#0a0f1e]" style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}>SB</div>
              <span className="font-grotesk text-sm font-semibold text-slate-400">SnapBase</span>
            </Link>
            <div className="flex items-center gap-6 text-xs text-slate-600">
              <Link href="/pricing" className="transition hover:text-slate-400">Pricing</Link>
              <Link href="/security" className="text-slate-400">Security</Link>
              <Link href="/terms" className="transition hover:text-slate-400">Terms</Link>
              <Link href="/privacy" className="transition hover:text-slate-400">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
