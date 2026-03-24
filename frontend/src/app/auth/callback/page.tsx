"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const provider = searchParams.get("provider");
    const code = searchParams.get("code");

    if (!provider || !code) {
      setError("Missing OAuth parameters");
      return;
    }

    const exchangeCode = async () => {
      try {
        const res = await api.post(`/auth/${provider}/callback`, { code });
        localStorage.setItem("token", res.data.token);
        router.push("/dashboard");
      } catch {
        setError("Authentication failed. Please try again.");
        setTimeout(() => router.push("/login"), 3000);
      }
    };

    exchangeCode();
  }, [searchParams, router]);

  return (
    <div className="text-center">
      {error ? (
        <div className="space-y-2">
          <p className="text-red-400">{error}</p>
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Completing sign in...</p>
        </div>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
      <Suspense fallback={
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
