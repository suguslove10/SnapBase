import Link from "next/link";
import {
  Database, Clock, Cloud, Mail, Lock, Download,
  ShieldCheck, Zap, Webhook, Terminal,
  Shield, Sparkles, Cog, ArrowLeftRight,
} from "lucide-react";
import NavbarAuthButton from "@/components/NavbarAuthButton";

const coreFeatures = [
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
    title: "Zero-Knowledge Encryption",
    desc: "Backups AES-256 encrypted before leaving your server. Only you hold the key — we cannot read your data.",
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

const powerFeatures = [
  {
    icon: Webhook,
    title: "Global Webhooks",
    desc: "Receive real-time HTTP notifications for every backup event, anomaly, schedule change, or org activity. HMAC-signed for security.",
    tag: "Pro+",
    tagColor: "bg-purple-500/15 text-purple-400",
    gradient: "from-purple-500/10 to-purple-500/5",
    iconColor: "text-purple-400",
    border: "hover:border-purple-500/30",
  },
  {
    icon: Cog,
    title: "Pre/Post Backup Hooks",
    desc: "Run SQL scripts or call webhooks before and after each backup. Flush caches, warm replicas, trigger pipelines automatically.",
    tag: "Pro+",
    tagColor: "bg-amber-500/15 text-amber-400",
    gradient: "from-amber-500/10 to-amber-500/5",
    iconColor: "text-amber-400",
    border: "hover:border-amber-500/30",
  },
  {
    icon: ArrowLeftRight,
    title: "DB Sync (Prod → Staging)",
    desc: "Schedule automated syncs from your production database to staging or dev. Keep environments in sync without manual effort.",
    tag: "Team",
    tagColor: "bg-blue-500/15 text-blue-400",
    gradient: "from-blue-500/10 to-blue-500/5",
    iconColor: "text-blue-400",
    border: "hover:border-blue-500/30",
  },
  {
    icon: Terminal,
    title: "SnapBase CLI",
    desc: "Trigger backups, list connections, run restores — all from your terminal. Install with one command. OAuth login via browser.",
    tag: "All Plans",
    tagColor: "bg-emerald-500/15 text-emerald-400",
    gradient: "from-emerald-500/10 to-emerald-500/5",
    iconColor: "text-emerald-400",
    border: "hover:border-emerald-500/30",
  },
  {
    icon: Shield,
    title: "Connection-Level RBAC",
    desc: "Grant teammates granular access per connection — View, Backup, Restore, or Manage. Owners always retain full control.",
    tag: "Team",
    tagColor: "bg-blue-500/15 text-blue-400",
    gradient: "from-blue-500/10 to-blue-500/5",
    iconColor: "text-blue-400",
    border: "hover:border-blue-500/30",
  },
  {
    icon: Sparkles,
    title: "AI Schema Insights",
    desc: "GPT-4o analyzes your database schema and surfaces performance issues, missing indexes, security risks, and naming inconsistencies.",
    tag: "Pro+",
    tagColor: "bg-purple-500/15 text-purple-400",
    gradient: "from-purple-500/10 to-purple-500/5",
    iconColor: "text-purple-400",
    border: "hover:border-purple-500/30",
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
    desc: "Backups run on schedule. Get instant alerts on success or failure. Download or restore anytime.",
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="SnapBase" style={{height:"36px",width:"auto"}} />
            <span className="font-grotesk text-base font-semibold text-white">SnapBase</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/pricing" className="hidden text-sm text-slate-400 transition hover:text-white sm:block">Pricing</Link>
            <Link href="/security" className="hidden text-sm text-slate-400 transition hover:text-white sm:block">Security</Link>
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
          Webhooks, AI insights, DB sync, CLI access, and team RBAC — everything your team needs.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/login"
            className="rounded-xl px-8 py-3.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.4)] whitespace-nowrap"
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

        {/* CLI install snippet */}
        <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <code className="font-jetbrains text-xs text-slate-400">curl -fsSL getsnapbase.com/install | bash</code>
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
            <strong className="font-grotesk text-white">12</strong>
            <span className="ml-1.5">features shipped</span>
          </span>
        </div>
      </div>

      {/* Core Features */}
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
          {coreFeatures.map((f) => (
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

      {/* Power Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-14 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span className="font-jetbrains text-xs text-purple-400">Advanced Features</span>
          </div>
          <h2 className="font-grotesk text-3xl font-bold text-white md:text-4xl">
            Built for{" "}
            <span style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Power Users &amp; Teams
            </span>
          </h2>
          <p className="mt-4 text-slate-400">
            Automate everything. Gain visibility. Move fast without breaking data.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {powerFeatures.map((f) => (
            <div
              key={f.title}
              className={`group relative rounded-2xl border border-white/[0.07] bg-gradient-to-b ${f.gradient} p-6 transition-all duration-200 ${f.border} hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <f.icon className={`h-5 w-5 ${f.iconColor}`} />
                </div>
                <span className={`rounded-full px-2 py-0.5 font-jetbrains text-[10px] font-medium ${f.tagColor}`}>{f.tag}</span>
              </div>
              <h3 className="mb-2 font-grotesk text-base font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CLI section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
        <div
          className="overflow-hidden rounded-2xl border border-emerald-500/20"
          style={{ background: "rgba(16,185,129,0.04)", backdropFilter: "blur(12px)" }}
        >
          <div className="grid gap-8 p-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-jetbrains text-xs text-emerald-400">CLI Tool</span>
              </div>
              <h2 className="font-grotesk text-2xl font-bold text-white">
                Manage backups from your terminal
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                The SnapBase CLI lets you trigger backups, list connections, and restore databases without leaving your terminal. OAuth login via browser — no passwords in scripts.
              </p>
              <div className="mt-6 space-y-2 font-jetbrains text-xs">
                {[
                  { cmd: "snapbase login", desc: "# authenticate via browser" },
                  { cmd: "snapbase backup run prod-db", desc: "# trigger a backup" },
                  { cmd: "snapbase restore 42", desc: "# restore backup #42" },
                ].map((l) => (
                  <div key={l.cmd} className="flex items-center gap-3">
                    <span className="text-emerald-400">$</span>
                    <span className="text-white">{l.cmd}</span>
                    <span className="text-slate-600">{l.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/30 p-5 font-jetbrains text-xs">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-slate-500">terminal</span>
              </div>
              <div className="space-y-1.5 text-slate-300">
                <p><span className="text-emerald-400">$</span> curl -fsSL getsnapbase.com/install | bash</p>
                <p className="text-slate-500">Downloading SnapBase CLI...</p>
                <p className="text-slate-500">snapbase installed successfully!</p>
                <p className="mt-3"><span className="text-emerald-400">$</span> snapbase login</p>
                <p className="text-slate-500">Opening browser for authentication...</p>
                <p className="text-slate-500">Verification code: <span className="text-white">A3F2-K9PQ</span></p>
                <p className="text-emerald-400">✓ Logged in as sugu@example.com</p>
                <p className="mt-3"><span className="text-emerald-400">$</span> snapbase connections list</p>
                <p className="text-slate-500">NAME            TYPE        HOST</p>
                <p className="text-white">prod-postgres   postgres    db.example.com</p>
                <p className="text-white">users-mysql     mysql       mysql.example.com</p>
              </div>
            </div>
          </div>
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
            Free plan available. Pro from $9/mo. Team plan for unlimited power. No credit card required.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl px-8 py-3.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(0,180,255,0.4)] whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              Get Started Free
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/[0.12] px-8 py-3.5 text-sm font-semibold text-slate-300 transition hover:border-[#00b4ff]/30 hover:text-white whitespace-nowrap"
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
