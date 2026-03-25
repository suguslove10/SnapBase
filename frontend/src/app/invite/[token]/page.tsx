"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface InviteInfo {
  org_name: string;
  role: string;
  email: string;
}

const roleBadgeStyle: Record<string, string> = {
  admin:    "bg-purple-500/10 text-purple-400 border-purple-500/20",
  engineer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  viewer:   "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired" | "accepted">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split(".")[1]));
        if (typeof payload.exp === "number" && payload.exp * 1000 > Date.now()) {
          setIsLoggedIn(true);
        }
      } catch { /* ignore */ }
    }

    api.get(`/invite/${token}`).then((res) => {
      setInvite(res.data);
      setStatus("ready");
    }).catch((err) => {
      if (err.response?.status === 410) {
        setStatus("expired");
      } else {
        setErrorMsg(err.response?.data?.error || "Invitation not found");
        setStatus("error");
      }
    });
  }, [token]);

  const handleAccept = async () => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }
    setAccepting(true);
    try {
      await api.post(`/invite/${token}/accept`, {});
      setStatus("accepted");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErrorMsg(msg || "Failed to accept invitation");
      setStatus("error");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "#0a0f1e" }}
    >
      {/* Background grid */}
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
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img src="/logo-icon.png" alt="SnapBase" style={{height:"44px",width:"auto"}} />
            <span className="font-grotesk text-xl font-semibold text-white">SnapBase</span>
          </Link>
        </div>

        <div
          className="rounded-2xl border border-white/[0.08] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          style={{ background: "rgba(13,21,38,0.9)", backdropFilter: "blur(20px)" }}
        >
          {status === "loading" && (
            <div className="text-center text-sm text-slate-500">Loading invitation…</div>
          )}

          {status === "error" && (
            <div className="text-center">
              <div className="mb-3 text-4xl">✗</div>
              <h1 className="font-grotesk text-xl font-bold text-white">Invalid Invitation</h1>
              <p className="mt-2 text-sm text-slate-400">{errorMsg}</p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-semibold text-[#0a0f1e]"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                Go Home
              </Link>
            </div>
          )}

          {status === "expired" && (
            <div className="text-center">
              <div className="mb-3 text-4xl">⏰</div>
              <h1 className="font-grotesk text-xl font-bold text-white">Invitation Expired</h1>
              <p className="mt-2 text-sm text-slate-400">This invitation link has expired. Ask the team owner to send a new invite.</p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-semibold text-[#0a0f1e]"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                Go Home
              </Link>
            </div>
          )}

          {status === "accepted" && (
            <div className="text-center">
              <div className="mb-3 text-4xl text-emerald-400">✓</div>
              <h1 className="font-grotesk text-xl font-bold text-white">You&apos;re in!</h1>
              <p className="mt-2 text-sm text-slate-400">You&apos;ve joined <strong className="text-white">{invite?.org_name}</strong>.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-6 w-full rounded-xl py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {status === "ready" && invite && (
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                style={{ background: "rgba(0,180,255,0.10)" }}
              >
                ✉
              </div>
              <h1 className="font-grotesk text-2xl font-bold text-white">You&apos;re invited!</h1>
              <p className="mt-2 text-sm text-slate-400">
                Join <strong className="text-white">{invite.org_name}</strong> on SnapBase
              </p>

              <div className="my-5">
                <span className={`rounded-full border px-3 py-1 font-jetbrains text-[11px] font-semibold uppercase tracking-wider ${roleBadgeStyle[invite.role] ?? roleBadgeStyle.viewer}`}>
                  {invite.role}
                </span>
              </div>

              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
              >
                {accepting ? "Joining…" : isLoggedIn ? "Accept Invitation" : "Sign in to Accept"}
              </button>

              {!isLoggedIn && (
                <p className="mt-3 text-xs text-slate-600">
                  Don&apos;t have an account?{" "}
                  <Link href={`/signup?redirect=/invite/${token}`} className="text-[#00b4ff]">
                    Sign up free
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
