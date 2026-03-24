"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<{ google: boolean; github: boolean }>({ google: false, github: false });
  const router = useRouter();

  useEffect(() => {
    api.get("/auth/providers").then((res) => setOauthProviders(res.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", { email, password, name });
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: string) => {
    try {
      const res = await api.get(`/auth/${provider}`);
      window.location.href = res.data.url;
    } catch {
      setError(`Failed to start ${provider} login`);
    }
  };

  const hasOAuth = oauthProviders.google || oauthProviders.github;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f172a]">
      <div className="absolute -left-40 -top-40 h-80 w-80 animate-pulse rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 animate-pulse rounded-full bg-violet-500/20 blur-3xl" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center bg-indigo-500 text-xs font-black tracking-tight text-white">
              SB
            </div>
            <span className="text-xl font-light tracking-wide text-slate-200">SnapBase</span>
          </div>
          <p className="text-sm text-slate-400">Create your account</p>
        </div>

        {hasOAuth && (
          <div className="mb-6 space-y-3">
            {oauthProviders.google && (
              <Button type="button" variant="outline" onClick={() => handleOAuth("google")}
                className="w-full border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign up with Google
              </Button>
            )}
            {oauthProviders.github && (
              <Button type="button" variant="outline" onClick={() => handleOAuth("github")}
                className="w-full border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white">
                <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Sign up with GitHub
              </Button>
            )}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#0f172a] px-3 text-slate-500" style={{ backgroundColor: "rgba(15, 23, 42, 0.8)" }}>or sign up with email</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-slate-300">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white hover:from-indigo-500 hover:to-violet-500"
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Already have an account?{" "}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300">Sign in</a>
        </p>
      </div>
    </div>
  );
}
