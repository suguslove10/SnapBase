import Link from "next/link";
import { ShieldCheck, Lock, Globe, Database, FileText, Mail } from "lucide-react";

const sections = [
  {
    icon: Lock,
    title: "Credential Protection",
    accent: "border-t-emerald-500",
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
    accent: "border-t-indigo-500",
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
    accent: "border-t-violet-500",
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
    accent: "border-t-cyan-500",
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
    accent: "border-t-amber-500",
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
    accent: "border-t-rose-500",
    items: [
      "Found a vulnerability? Email security@snapbase.local",
      "We triage all security reports within 48 hours",
      "We will never take legal action against good-faith security researchers",
      "Critical fixes are patched and released as a priority",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Navbar */}
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-indigo-500 text-[11px] font-black tracking-tight text-white">
              SB
            </div>
            <span className="text-[15px] font-light tracking-wide text-slate-200">SnapBase</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-slate-400 hover:text-white transition">Pricing</Link>
            <Link href="/security" className="text-sm text-white">Security</Link>
            <Link href="/login" className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-medium transition hover:from-indigo-500 hover:to-violet-500">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pt-20 pb-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <ShieldCheck className="h-8 w-8 text-emerald-400" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Security First
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
          You&apos;re trusting us with credentials to your most important data.
          Here&apos;s exactly how we protect them.
        </p>
      </section>

      {/* Trust bar */}
      <div className="mx-auto mb-16 max-w-3xl border-y border-white/[0.06] py-5">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> AES-256-GCM at rest</span>
          <span className="text-white/10">|</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> TLS in transit</span>
          <span className="text-white/10">|</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Zero credential logging</span>
          <span className="text-white/10">|</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Open source</span>
        </div>
      </div>

      {/* Sections grid */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <div
              key={s.title}
              className={`rounded-xl border border-white/10 border-t-2 ${s.accent} bg-[#1e293b] p-6 transition hover:border-white/20`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                <s.icon className="h-5 w-5 text-slate-300" />
              </div>
              <h3 className="mb-4 text-lg font-semibold">{s.title}</h3>
              <ul className="space-y-2">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-400">
                    <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-sm text-slate-500">
        <div className="flex items-center justify-center gap-6 mb-3">
          <Link href="/" className="hover:text-slate-300 transition">Home</Link>
          <Link href="/pricing" className="hover:text-slate-300 transition">Pricing</Link>
          <Link href="/security" className="text-slate-300">Security</Link>
        </div>
        Built by Sugu &middot;{" "}
        <a href="https://github.com/suguslove10" className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer">
          github.com/suguslove10
        </a>
      </footer>
    </div>
  );
}
