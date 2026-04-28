"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface Component {
  name: string;
  status: "operational" | "degraded" | "down";
  latency_ms: number;
  uptime_30d: number;
}

interface StatusResponse {
  overall: "operational" | "degraded" | "down";
  components: Component[];
  last_checked: string;
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = () => {
    const url = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api") + "/status";
    fetch(url)
      .then((r) => r.json())
      .then((json) => { setData(json); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const overall = data?.overall ?? "operational";
  const overallColor = overall === "operational" ? "#00ff88" : overall === "degraded" ? "#fbbf24" : "#f87171";
  const overallText = overall === "operational" ? "All systems operational" : overall === "degraded" ? "Some systems degraded" : "Major outage";
  const OverallIcon = overall === "operational" ? CheckCircle : overall === "degraded" ? AlertTriangle : XCircle;

  const compIcon = (s: Component["status"]) => {
    if (s === "operational") return <CheckCircle className="h-4 w-4 text-[#00ff88]" />;
    if (s === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "#0a0f1e" }}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      <nav className="relative z-10 border-b border-white/[0.06]" style={{ backdropFilter: "blur(12px)", background: "rgba(10,15,30,0.8)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="SnapBase" style={{height:"36px",width:"auto"}} />
            <span className="font-grotesk text-base font-semibold text-white">SnapBase</span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">Home</Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16">
        <div
          className="rounded-2xl p-8"
          style={{ background: `${overallColor}10`, border: `1px solid ${overallColor}30` }}
        >
          <div className="flex items-center gap-4">
            <OverallIcon className="h-10 w-10" style={{ color: overallColor }} />
            <div>
              <h1 className="font-grotesk text-2xl font-bold text-white">{overallText}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {data?.last_checked && `Last checked ${new Date(data.last_checked).toLocaleTimeString()}`}
                {!data && loading && "Checking…"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        <h2 className="mb-4 font-grotesk text-sm font-semibold uppercase tracking-widest text-slate-500">Components</h2>
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]" style={{ background: "rgba(13,21,38,0.7)" }}>
          {(data?.components ?? []).map((c, i) => (
            <div
              key={c.name}
              className={`flex items-center justify-between px-6 py-4 ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
            >
              <div className="flex items-center gap-3">
                {compIcon(c.status)}
                <div>
                  <p className="font-grotesk text-sm font-semibold text-white">{c.name}</p>
                  <p className="mt-0.5 font-jetbrains text-[11px] capitalize text-slate-500">
                    {c.status}{c.latency_ms > 0 && ` · ${c.latency_ms}ms`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-grotesk text-sm font-semibold text-white">{c.uptime_30d.toFixed(2)}%</p>
                <p className="font-jetbrains text-[10px] uppercase tracking-widest text-slate-500">30-day uptime</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-slate-600">
          Auto-refreshes every 30s · Subscribe to incidents at{" "}
          <a href="mailto:hello@getsnapbase.com" className="text-[#00b4ff] hover:underline">hello@getsnapbase.com</a>
        </p>
      </section>
    </div>
  );
}
