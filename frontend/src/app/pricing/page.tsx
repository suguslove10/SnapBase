"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Zap } from "lucide-react";
import api from "@/lib/api";

const tiers = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    annualTotal: 0,
    description: "For side projects and personal use",
    features: [
      "2 database connections",
      "Daily backups only",
      "7 day retention",
      "Email notifications",
      "Community support",
    ],
    cta: "Get Started",
    href: "/login",
    highlighted: false,
  },
  {
    name: "Pro",
    monthly: 12,
    annual: 10,
    annualTotal: 120,
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
    href: "/login",
    highlighted: true,
  },
  {
    name: "Team",
    monthly: 29,
    annual: 23,
    annualTotal: 276,
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
    href: "/login",
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
    a: "Backups are stored in S3-compatible object storage (MinIO by default). You can configure your own AWS S3, Cloudflare R2, or Backblaze B2 bucket.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const router = useRouter();

  const handleCheckout = async (plan: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }
    setLoadingPlan(plan);
    try {
      const res = await api.post("/billing/checkout", { plan });
      window.location.href = res.data.url;
    } catch {
      setLoadingPlan(null);
    }
  };

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
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,180,255,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Navbar */}
      <nav
        className="relative z-10 border-b border-white/[0.06]"
        style={{ backdropFilter: "blur(12px)", background: "rgba(10,15,30,0.8)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="SnapBase" style={{height:"44px",width:"auto"}} />
            <span className="font-grotesk text-base font-semibold text-white">SnapBase</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-[#00b4ff]">Pricing</Link>
            <Link href="/security" className="text-sm text-slate-400 transition hover:text-white">Security</Link>
            <Link
              href="/login"
              className="rounded-lg px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pt-20 text-center">
        <h1 className="font-grotesk text-4xl font-bold md:text-5xl">
          Simple, transparent{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #00b4ff, #00f5d4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            pricing
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
          Start free. Upgrade when you need more power. No hidden fees.
        </p>

        {/* Annual toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={`text-sm font-medium transition-colors ${!annual ? "text-white" : "text-slate-500"}`}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual((v) => !v)}
            aria-label="Toggle annual billing"
            className="relative h-7 w-12 rounded-full border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00b4ff]/50"
            style={{ background: annual ? "linear-gradient(135deg, #00b4ff, #00f5d4)" : "rgba(255,255,255,0.08)" }}
          >
            <span
              className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
              style={{ left: annual ? "calc(100% - 1.5rem)" : "0.25rem" }}
            />
          </button>
          <span className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${annual ? "text-white" : "text-slate-500"}`}>
            Annual
            <span className="rounded-full bg-[#00ff88]/10 px-2 py-0.5 font-jetbrains text-[10px] font-semibold text-[#00ff88]">
              Save 20%
            </span>
          </span>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const price = annual ? tier.annual : tier.monthly;
            return (
              <div
                key={tier.name}
                className={`relative rounded-2xl transition-all duration-200 hover:-translate-y-1 ${
                  tier.highlighted
                    ? "shadow-[0_0_40px_rgba(0,180,255,0.15)]"
                    : ""
                }`}
                style={
                  tier.highlighted
                    ? { padding: "1px", background: "linear-gradient(135deg, #00b4ff, #00f5d4)", borderRadius: "1rem" }
                    : { border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem" }
                }
              >
                <div
                  className="relative h-full rounded-[calc(1rem-1px)] p-6"
                  style={{ background: "#0d1526" }}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span
                        className="rounded-full px-3 py-1 font-grotesk text-[11px] font-semibold text-[#0a0f1e]"
                        style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
                      >
                        Most Popular
                      </span>
                    </div>
                  )}

                  <h3 className="font-grotesk text-lg font-bold text-white">{tier.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{tier.description}</p>

                  <div className="mt-5">
                    <div className="flex items-end gap-1">
                      <span className="font-grotesk text-4xl font-bold text-white">${price}</span>
                      {price > 0 && (
                        <span className="mb-1 text-sm text-slate-500">/mo</span>
                      )}
                    </div>
                    {annual && tier.annualTotal > 0 && (
                      <p className="mt-1 font-jetbrains text-xs text-slate-500">
                        ${tier.annualTotal} billed annually
                      </p>
                    )}
                    {!annual && tier.monthly > 0 && (
                      <p className="mt-1 font-jetbrains text-xs text-slate-600">
                        or ${tier.annual}/mo billed annually
                      </p>
                    )}
                  </div>

                  {tier.monthly === 0 ? (
                    <Link
                      href={tier.href}
                      className="mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition border border-white/[0.10] text-slate-300 hover:border-[#00b4ff]/30 hover:text-white"
                    >
                      {tier.cta}
                    </Link>
                  ) : tier.name === "Team" ? (
                    <Link
                      href="/contact"
                      className="mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition border border-white/[0.10] text-slate-300 hover:border-[#00b4ff]/30 hover:text-white"
                    >
                      {tier.cta}
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleCheckout(tier.name.toLowerCase())}
                      disabled={loadingPlan === tier.name.toLowerCase()}
                      className="mt-6 w-full rounded-xl py-2.5 text-center text-sm font-semibold transition text-[#0a0f1e] hover:opacity-90 disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
                    >
                      {loadingPlan === tier.name.toLowerCase() ? "Redirecting…" : tier.cta}
                    </button>
                  )}

                  <ul className="mt-6 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-slate-400">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00b4ff]" />
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
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-20">
        <h2 className="mb-8 text-center font-grotesk text-2xl font-bold text-white">
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <div
              key={faq.q}
              className="rounded-2xl border border-white/[0.07] p-5 transition hover:border-[#00b4ff]/20"
              style={{ background: "rgba(13,21,38,0.8)" }}
            >
              <h3 className="font-grotesk text-sm font-semibold text-white">{faq.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-20 text-center">
        <div
          className="rounded-2xl border border-[#00b4ff]/20 p-10"
          style={{ background: "rgba(0,180,255,0.04)" }}
        >
          <Zap className="mx-auto mb-3 h-7 w-7 text-[#00b4ff]" />
          <h2 className="font-grotesk text-2xl font-bold text-white">Ready to get started?</h2>
          <p className="mt-2 text-sm text-slate-400">Free plan, no credit card required.</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl px-8 py-3 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
          >
            Start for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center text-sm text-slate-600">
        Built by{" "}
        <a href="https://thesugu.com" className="text-[#00b4ff] hover:underline" target="_blank" rel="noopener noreferrer">
          Sugu
        </a>
      </footer>
    </div>
  );
}
