"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    description: "For side projects and personal use",
    features: [
      "2 database connections",
      "Daily backups only",
      "7 day retention",
      "Email notifications",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    monthly: 12,
    annual: 10,
    description: "For growing teams and production databases",
    features: [
      "Unlimited database connections",
      "Every 15 min to monthly schedules",
      "90 day retention",
      "Email + Slack notifications",
      "Backup verification",
      "One-click restore",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Team",
    monthly: 29,
    annual: 23,
    description: "For organizations with compliance needs",
    features: [
      "Everything in Pro",
      "5 team members",
      "Audit log",
      "Compliance PDF export",
      "PagerDuty integration",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade or downgrade at any time. When you upgrade, you get immediate access to new features. When you downgrade, changes take effect at the end of your billing cycle.",
  },
  {
    q: "What happens when my trial ends?",
    a: "Your Pro trial lasts 14 days. After that, you'll be moved to the Free plan unless you add a payment method. No data is deleted.",
  },
  {
    q: "Do you store my database credentials?",
    a: "Credentials are encrypted at rest using AES-256 and never logged. Only the backup runner accesses them at runtime.",
  },
  {
    q: "What databases are supported?",
    a: "PostgreSQL, MySQL, MongoDB, and SQLite. We use native tools (pg_dump, mysqldump, mongodump) for maximum compatibility.",
  },
  {
    q: "Where are backups stored?",
    a: "Backups are stored in S3-compatible object storage (MinIO by default). You can configure your own S3 bucket for full control over your data.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

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
            <Link
              href="/login"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-medium transition hover:from-indigo-500 hover:to-violet-500"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="mx-auto max-w-4xl px-6 pt-20 text-center">
        <h1 className="text-4xl font-bold md:text-5xl">
          Simple, transparent{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            pricing
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
          Start free. Upgrade when you need more power. No hidden fees.
        </p>

        {/* Annual toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? "text-white" : "text-slate-500"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-6 w-11 rounded-full transition-colors ${annual ? "bg-indigo-600" : "bg-white/10"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${annual ? "translate-x-5" : ""}`}
            />
          </button>
          <span className={`text-sm ${annual ? "text-white" : "text-slate-500"}`}>
            Annual <span className="text-emerald-400 text-xs font-medium ml-1">Save 20%</span>
          </span>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const price = annual ? tier.annual : tier.monthly;
            return (
              <div
                key={tier.name}
                className={`relative rounded-xl p-[1px] transition-all hover:scale-[1.02] ${
                  tier.highlighted
                    ? "bg-gradient-to-b from-indigo-500 to-violet-500"
                    : "bg-white/10"
                }`}
              >
                <div className="relative h-full rounded-[11px] bg-[#131c2e] p-6">
                  {tier.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-[11px] font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg font-semibold">{tier.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{tier.description}</p>
                  <div className="mt-5">
                    <span className="text-4xl font-bold">${price}</span>
                    {price > 0 && <span className="text-sm text-slate-500">/month</span>}
                  </div>
                  <Link
                    href="/login"
                    className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-medium transition ${
                      tier.highlighted
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500"
                        : "border border-white/10 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                  <ul className="mt-6 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="mb-8 text-center text-2xl font-bold">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.q} className="rounded-xl border border-white/10 bg-[#1e293b] p-5">
              <h3 className="text-sm font-semibold text-white">{faq.q}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-sm text-slate-500">
        Built by Sugu &middot;{" "}
        <a href="https://github.com/suguslove10" className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer">
          github.com/suguslove10
        </a>
      </footer>
    </div>
  );
}
