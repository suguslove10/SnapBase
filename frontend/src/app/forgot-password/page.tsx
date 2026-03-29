"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
    } catch {
      // Always show success — don't reveal if email exists
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "#0a0f1e" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(0,180,255,0.12)" }} />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(0,245,212,0.08)" }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="SnapBase" style={{ height: "44px", width: "auto" }} />
            <span className="font-grotesk text-xl font-semibold text-white">SnapBase</span>
          </Link>
          <p className="mt-3 text-sm text-slate-400">Reset Password</p>
        </div>

        <div
          className="rounded-2xl border border-white/[0.08] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          style={{ background: "rgba(13,21,38,0.9)", backdropFilter: "blur(20px)" }}
        >
          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#00ff88]/20 bg-[#00ff88]/10">
                <svg className="h-7 w-7 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-grotesk text-base font-semibold text-white">Check your email</p>
                <p className="mt-1.5 text-sm text-slate-400">
                  If <span className="text-slate-300">{email}</span> has an account, we sent a reset link.
                </p>
              </div>
              <p className="text-xs text-slate-600">
                Didn&apos;t get it?{" "}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-[#00b4ff] transition hover:text-[#00f5d4]"
                >
                  Try again
                </button>
              </p>
              <p className="text-xs text-slate-600 mt-2">
                If you signed up with Google or GitHub, use that to sign in — password reset doesn&apos;t apply to social accounts.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Reset Password</p>
                <p className="text-xs text-slate-400">Enter your email and we&apos;ll send you a reset link.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 hover:shadow-[0_4px_20px_rgba(99,102,241,0.3)] disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          <Link href="/login" className="text-[#00b4ff] transition hover:text-[#00f5d4]">
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
