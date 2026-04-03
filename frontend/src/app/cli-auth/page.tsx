"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function CLIAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pollToken = searchParams.get("token") ?? "";
  const code = searchParams.get("code") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!pollToken || !code) {
      setStatus("error");
      setErrorMsg("Invalid authorization link. Please run `snapbase login` again.");
    }
  }, [pollToken, code]);

  async function handleAuthorize() {
    setStatus("loading");
    try {
      const res = await fetch("/api/cli/auth/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poll_token: pollToken }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Authorization failed");
      }
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Authorization failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
        {/* Logo / brand */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white text-2xl font-bold mb-3">
            S
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Authorize SnapBase CLI</h1>
          <p className="text-sm text-gray-500 mt-1">
            A CLI session is requesting access to your account.
          </p>
        </div>

        {status === "error" && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {status === "success" ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700 font-medium">
              CLI authorized successfully!
            </div>
            <p className="text-sm text-gray-500">You can close this window and return to your terminal.</p>
          </div>
        ) : (
          <>
            {code && (
              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">
                  Verification Code
                </p>
                <div className="inline-block bg-gray-100 rounded-lg px-6 py-3 font-mono text-2xl font-bold text-gray-900 tracking-widest">
                  {code}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Confirm this matches what your terminal shows.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleAuthorize}
                disabled={status === "loading" || status === "error"}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                {status === "loading" ? "Authorizing…" : "Authorize CLI Access"}
              </button>

              <button
                onClick={() => router.push("/dashboard")}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              This will grant 30-day terminal access to your SnapBase account.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CLIAuthPage() {
  return (
    <Suspense>
      <CLIAuthContent />
    </Suspense>
  );
}
