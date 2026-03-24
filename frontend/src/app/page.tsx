import Link from "next/link";
import { Database, Clock, Cloud, Mail, Lock, Download } from "lucide-react";

const features = [
  { icon: Database, title: "Multi-Database Support", desc: "PostgreSQL, MySQL, MongoDB, SQLite — all supported out of the box.", accent: "border-t-indigo-500" },
  { icon: Clock, title: "Flexible Scheduling", desc: "Hourly, daily, weekly or custom cron expressions for full control.", accent: "border-t-violet-500" },
  { icon: Cloud, title: "S3-Compatible Storage", desc: "Backups stored securely in MinIO or any S3-compatible storage.", accent: "border-t-emerald-500" },
  { icon: Mail, title: "Instant Alerts", desc: "Email notifications on backup success or failure.", accent: "border-t-amber-500" },
  { icon: Lock, title: "Encrypted Connections", desc: "Database credentials stored encrypted and transmitted securely.", accent: "border-t-rose-500" },
  { icon: Download, title: "One-Click Restore", desc: "Download any backup instantly with a single click.", accent: "border-t-cyan-500" },
];

const steps = [
  { step: "01", title: "Connect Your Database", desc: "Add your database connection details — we support all major databases." },
  { step: "02", title: "Set Your Schedule", desc: "Choose from presets or write custom cron expressions." },
  { step: "03", title: "Sleep Easy", desc: "We handle backups automatically. Get notified on success or failure." },
];

function BrowserMockup() {
  return (
    <div className="mx-auto mt-16 max-w-4xl px-6">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c1322] shadow-2xl shadow-indigo-500/10">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white/5 px-3 py-1 text-xs text-slate-500">
            localhost:3001/dashboard
          </div>
        </div>
        {/* Fake dashboard content */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Backups", val: "127", color: "from-indigo-500/20 to-indigo-500/5" },
              { label: "Storage Used", val: "2.4 GB", color: "from-violet-500/20 to-violet-500/5" },
              { label: "Schedules", val: "8", color: "from-emerald-500/20 to-emerald-500/5" },
              { label: "Last Backup", val: "success", color: "from-green-500/20 to-green-500/5" },
            ].map((c) => (
              <div key={c.label} className={`rounded-lg bg-gradient-to-b ${c.color} p-3`}>
                <p className="text-[10px] text-slate-500">{c.label}</p>
                <p className="mt-1 text-sm font-bold text-white">{c.val}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500/60" />
                <div className="h-2 w-24 rounded bg-white/10" />
                <div className="h-2 w-16 rounded bg-white/5" />
                <div className="ml-auto h-2 w-12 rounded bg-white/5" />
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
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Navbar */}
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-indigo-500 text-[11px] font-black tracking-tight text-white">
              SB
            </div>
            <span className="text-[15px] font-light tracking-wide text-slate-200">SnapBase</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-slate-400 hover:text-white transition">Pricing</Link>
            <Link href="/security" className="text-sm text-slate-400 hover:text-white transition">Security</Link>
            <Link
              href="/login"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-medium transition hover:from-indigo-500 hover:to-violet-500"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-6 pt-24 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          Automated Database Backups.{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Zero Worry.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Schedule automated backups for PostgreSQL, MySQL, MongoDB, and SQLite.
          Get notified instantly. Download anytime. Never lose data again.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-3 text-sm font-semibold transition hover:from-indigo-500 hover:to-violet-500"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/suguslove10"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/20 px-8 py-3 text-sm font-semibold transition hover:bg-white/5"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Browser mockup */}
      <BrowserMockup />

      {/* Stats bar */}
      <div className="mx-auto mt-16 max-w-3xl border-y border-white/[0.06] py-6">
        <div className="flex items-center justify-center gap-8 text-sm text-slate-400">
          <span><strong className="text-white">127</strong> backups run</span>
          <span className="text-white/10">|</span>
          <span><strong className="text-white">4</strong> databases supported</span>
          <span className="text-white/10">|</span>
          <span><strong className="text-white">99.9%</strong> uptime</span>
        </div>
      </div>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-4 text-center text-3xl font-bold">Everything You Need</h2>
        <p className="mb-12 text-center text-slate-400">
          A complete backup solution for all your databases.
        </p>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className={`rounded-xl border border-white/10 border-t-2 ${f.accent} bg-[#1e293b] p-6 transition hover:border-white/20`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                <f.icon className="h-5 w-5 text-slate-300" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-lg font-bold">
                {s.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-sm text-slate-500">
        <div className="flex items-center justify-center gap-6 mb-3">
          <Link href="/pricing" className="hover:text-slate-300 transition">Pricing</Link>
          <Link href="/security" className="hover:text-slate-300 transition">Security</Link>
          <a href="https://github.com/suguslove10" className="hover:text-slate-300 transition" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
        Built by Sugu &middot;{" "}
        <a
          href="https://github.com/suguslove10"
          className="text-indigo-400 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/suguslove10
        </a>
      </footer>
    </div>
  );
}
