import Link from "next/link";
import { Database, Clock, Cloud, Mail, Lock, Download, ShieldCheck, Zap } from "lucide-react";
import NavbarAuthButton from "@/components/NavbarAuthButton";

const features = [
  {
    icon: Database,
    title: "Multi-Database Support",
    desc: "PostgreSQL, MySQL, MongoDB, SQLite — all supported with native tools for maximum compatibility.",
    gradient: "from-[#00b4ff]/20 to-[#00b4ff]/5",
    iconColor: "text-[#00b4ff]",
    border: "hover:border-[#00b4ff]/30",
  },
  {
    icon: Clock,
    title: "Flexible Scheduling",
    desc: "Hourly, daily, weekly or custom cron expressions. Every 15 minutes to monthly — full control.",
    gradient: "from-[#00f5d4]/20 to-[#00f5d4]/5",
    iconColor: "text-[#00f5d4]",
    border: "hover:border-[#00f5d4]/30",
  },
  {
    icon: Cloud,
    title: "S3-Compatible Storage",
    desc: "Backups stored in AWS S3, Cloudflare R2, Backblaze B2, Wasabi, or your own MinIO.",
    gradient: "from-[#00ff88]/20 to-[#00ff88]/5",
    iconColor: "text-[#00ff88]",
    border: "hover:border-[#00ff88]/30",
  },
  {
    icon: Mail,
    title: "Instant Alerts",
    desc: "Email and Slack notifications on backup success or failure. Know the moment something goes wrong.",
    gradient: "from-[#00b4ff]/20 to-[#00b4ff]/5",
    iconColor: "text-[#00b4ff]",
    border: "hover:border-[#00b4ff]/30",
  },
  {
    icon: Lock,
    title: "AES-256 Encryption",
    desc: "Database credentials encrypted at rest and in transit. Your secrets never leave the server unencrypted.",
    gradient: "from-[#00f5d4]/20 to-[#00f5d4]/5",
    iconColor: "text-[#00f5d4]",
    border: "hover:border-[#00f5d4]/30",
  },
  {
    icon: Download,
    title: "One-Click Restore",
    desc: "Download any backup instantly or restore directly to your database with a single click.",
    gradient: "from-[#00ff88]/20 to-[#00ff88]/5",
    iconColor: "text-[#00ff88]",
    border: "hover:border-[#00ff88]/30",
  },
];

const steps = [
  {
    step: "01",
    title: "Connect Your Database",
    desc: "Add your connection details. We support all major databases with no agents to install.",
  },
  {
    step: "02",
    title: "Set Your Schedule",
    desc: "Choose from presets or write custom cron expressions. We'll handle the rest automatically.",
  },
  {
    step: "03",
    title: "Sleep Easy",
    desc: "Backups run on schedule. Get instant alerts on success or failure. Download anytime.",
  },
];

function DashboardPreview() {
  return (
    <div className="mx-auto mt-16 max-w-4xl px-6">
      <div
        className="overflow-hidden rounded-2xl border border-[#00b4ff]/20 shadow-[0_0_80px_rgba(0,180,255,0.1)]"
        style={{ background: "rgba(10,20,40,0.8)", backdropFilter: "blur(16px)" }}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-jetbrains text-[11px] text-slate-500">
            app.snapbase.io/dashboard
          </div>
        </div>
        {/* Dashboard mockup */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Backups", val: "2,847", color: "from-[#00b4ff]/15 to-[#00b4ff]/5", text: "text-[#00b4ff]" },
              { label: "Storage Used", val: "12.4 GB", color: "from-[#00f5d4]/15 to-[#00f5d4]/5", text: "text-[#00f5d4]" },
              { label: "Schedules", val: "24", color: "from-[#00ff88]/15 to-[#00ff88]/5", text: "text-[#00ff88]" },
              { label: "Last Backup", val: "success", color: "from-emerald-500/15 to-emerald-500/5", text: "text-emerald-400" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border border-white/[0.06] bg-gradient-to-b ${c.color} p-3`}>
                <p className="font-jetbrains text-[9px] uppercase tracking-widest text-slate-500">{c.label}</p>
                <p className={`mt-1.5 font-grotesk text-sm font-bold ${c.text}`}>{c.val}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {[
              { name: "prod-postgres", type: "PostgreSQL", status: "success", size: "4.2 MB" },
              { name: "users-mysql", type: "MySQL", status: "success", size: "1.8 MB" },
              { name: "analytics-mongo", type: "MongoDB", status: "running", size: "—" },
            ].map((row) => (
              <div key={row.name} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                <div className={`h-1.5 w-1.5 rounded-full ${row.status === "success" ? "bg-emerald-400" : "bg-yellow-400 animate-pulse"}`} />
                <span className="font-mono text-xs text-white">{row.name}</span>
                <span className="text-[10px] text-slate-600">{row.type}</span>
                <span className="ml-auto font-jetbrains text-[10px] text-slate-500">{row.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: "#0a0f1e" }}>
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Radial glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,180,255,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Navbar */}
      <nav className="relative z-10 border-b border-white/[0.06]" style={{ backdropFilter: "blur(12px)", background: "rgba(10,15,30,0.8)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="SnapBase" style={{height:"44px",width:"auto"}} />
            <span className="font-grotesk text-base font-semibold text-white">SnapBase</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</Link>
            <Link href="/security" className="text-sm text-slate-400 transition hover:text-white">Security</Link>
            <NavbarAuthButton />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-24 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00b4ff]/20 bg-[#00b4ff]/5 px-4 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#00b4ff]" />
          <span className="font-jetbrains text-xs text-[#00b4ff]">AES-256 encrypted · Never lose data</span>
        </div>

        <h1 className="font-grotesk text-5xl font-bold leading-[1.1] tracking-tight md:text-6xl">
          Automated Database Backups.{" "}
          <span style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Zero Worry.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Schedule automated backups for PostgreSQL, MySQL, MongoDB, and SQLite.
          Get notified instantly. Restore with one click. Sleep easy.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/login"
            className="rounded-xl px-8 py-3.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.4)]"
            style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
          >
            Get Started Free
          </Link>
          <a
            href="https://github.com/suguslove10/SnapBase"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/[0.12] px-8 py-3.5 text-sm font-semibold text-slate-300 transition hover:border-[#00b4ff]/30 hover:bg-[#00b4ff]/5 hover:text-white"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Dashboard preview */}
      <div className="relative z-10">
        <DashboardPreview />
      </div>

      {/* Stats bar */}
      <div className="relative z-10 mx-auto mt-16 max-w-3xl border-y border-white/[0.06] py-7">
        <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-500">
          <span>
            <strong className="font-grotesk text-white">2,847</strong>
            <span className="ml-1.5">backups protected</span>
          </span>
          <span className="text-white/10">|</span>
          <span>
            <strong className="font-grotesk text-white">4</strong>
            <span className="ml-1.5">database types</span>
          </span>
          <span className="text-white/10">|</span>
          <span>
            <strong className="font-grotesk text-white">99.9%</strong>
            <span className="ml-1.5">uptime</span>
          </span>
          <span className="text-white/10">|</span>
          <span>
            <strong className="font-grotesk text-white">6</strong>
            <span className="ml-1.5">storage providers</span>
          </span>
        </div>
      </div>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <h2 className="font-grotesk text-3xl font-bold text-white md:text-4xl">
            Everything You Need to{" "}
            <span style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Protect Your Data
            </span>
          </h2>
          <p className="mt-4 text-slate-400">
            A complete backup solution built for developers and teams.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className={`group rounded-2xl border border-white/[0.07] bg-gradient-to-b ${f.gradient} p-6 transition-all duration-200 ${f.border} hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                <f.icon className={`h-5 w-5 ${f.iconColor}`} />
              </div>
              <h3 className="mb-2 font-grotesk text-base font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-16 text-center font-grotesk text-3xl font-bold text-white md:text-4xl">
          Up and Running in{" "}
          <span style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            3 Steps
          </span>
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.step} className="relative text-center">
              {i < steps.length - 1 && (
                <div className="absolute left-[calc(50%+3rem)] top-6 hidden h-px w-[calc(100%-3rem)] bg-gradient-to-r from-[#00b4ff]/30 to-transparent md:block" />
              )}
              <div
                className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl font-grotesk text-sm font-bold text-[#0a0f1e]"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                {s.step}
              </div>
              <h3 className="mb-2 font-grotesk text-base font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center">
        <div
          className="rounded-2xl border border-[#00b4ff]/20 p-10"
          style={{ background: "rgba(0,180,255,0.04)", backdropFilter: "blur(16px)" }}
        >
          <div className="mb-4 flex justify-center">
            <Zap className="h-8 w-8 text-[#00b4ff]" />
          </div>
          <h2 className="font-grotesk text-3xl font-bold text-white">
            Start protecting your databases today
          </h2>
          <p className="mx-auto mt-4 max-w-md text-slate-400">
            Free plan available. No credit card required. Set up your first backup in under 2 minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl px-8 py-3.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.4)]"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              Get Started Free
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/[0.12] px-8 py-3.5 text-sm font-semibold text-slate-300 transition hover:border-[#00b4ff]/30 hover:text-white"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <Link href="/pricing" className="transition hover:text-slate-300">Pricing</Link>
            <Link href="/security" className="transition hover:text-slate-300">Security</Link>
            <Link href="/contact" className="transition hover:text-slate-300">Contact</Link>
            <Link href="/terms" className="transition hover:text-slate-300">Terms</Link>
            <Link href="/privacy" className="transition hover:text-slate-300">Privacy</Link>
            <Link href="/refund" className="transition hover:text-slate-300">Refund Policy</Link>
            <a href="https://github.com/suguslove10/SnapBase" className="transition hover:text-slate-300" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <p className="mt-4 text-xs text-slate-700">© 2026 SnapBase · Built by Sugu</p>
        </div>
      </footer>
    </div>
  );
}
