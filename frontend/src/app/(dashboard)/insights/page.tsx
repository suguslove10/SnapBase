"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Zap, Shield, AlertTriangle, Layers, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import api from "@/lib/api";

interface TableInsight {
  name: string;
  observation: string;
  severity: "info" | "warning" | "error";
}

interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: "performance" | "security" | "naming" | "design";
}

interface Anomaly {
  description: string;
  severity: "warning" | "error";
}

interface InsightResult {
  summary: string;
  health_score: number;
  tables: TableInsight[];
  recommendations: Recommendation[];
  anomalies: Anomaly[];
}

interface ListItem {
  connection_id: number;
  connection_name: string;
  connection_type: string;
  insight_id: number | null;
  insights: InsightResult | null;
  model: string;
  generated_at: string | null;
}

const dbTypeColors: Record<string, string> = {
  postgres: "bg-blue-500/15 text-blue-400",
  mysql:    "bg-orange-500/15 text-orange-400",
  mongodb:  "bg-green-500/15 text-green-400",
  sqlite:   "bg-purple-500/15 text-purple-400",
};

const categoryIcons: Record<string, React.ReactNode> = {
  performance: <Zap className="h-3.5 w-3.5 text-yellow-400" />,
  security:    <Shield className="h-3.5 w-3.5 text-red-400" />,
  naming:      <Layers className="h-3.5 w-3.5 text-blue-400" />,
  design:      <Sparkles className="h-3.5 w-3.5 text-purple-400" />,
};

const impactBadge: Record<string, string> = {
  high:   "bg-red-500/15 text-red-400",
  medium: "bg-yellow-500/15 text-yellow-400",
  low:    "bg-slate-500/15 text-slate-400",
};

const severityColor: Record<string, string> = {
  info:    "text-blue-400",
  warning: "text-yellow-400",
  error:   "text-red-400",
};

function HealthRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function InsightsPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = () => {
    setLoading(true);
    api.get("/insights")
      .then((res) => setItems(res.data))
      .catch(() => toast.error("Failed to load insights"))
      .finally(() => setLoading(false));
  };

  const generate = async (connID: number, connName: string) => {
    setGenerating(connID);
    try {
      const res = await api.post(`/connections/${connID}/insights/generate`);
      const insight = res.data.insight;
      setItems((prev) =>
        prev.map((item) =>
          item.connection_id === connID
            ? { ...item, insight_id: insight.id, insights: insight.insights, model: insight.model, generated_at: insight.generated_at }
            : item
        )
      );
      setExpanded(connID);
      toast.success(`Insights generated for ${connName}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to generate insights";
      toast.error(msg);
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48 bg-white/[0.04]" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl bg-white/[0.04]" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-2xl font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            AI Schema Insights
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Claude analyzes your database schemas and surfaces recommendations.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-purple-400/40 mb-3" />
          <p className="text-slate-400 font-medium">No connections found.</p>
          <p className="text-sm text-slate-600 mt-1">Add a database connection first, then generate insights.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isExpanded = expanded === item.connection_id;
            const hasInsight = !!item.insights;
            const isGenerating = generating === item.connection_id;

            return (
              <div
                key={item.connection_id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-grotesk font-semibold text-white">{item.connection_name}</span>
                      <span className={`rounded px-1.5 py-0.5 font-jetbrains text-[10px] font-medium ${dbTypeColors[item.connection_type] ?? "bg-slate-500/15 text-slate-400"}`}>
                        {item.connection_type}
                      </span>
                    </div>
                    {item.generated_at && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                        <Clock className="h-3 w-3" />
                        Last analyzed {new Date(item.generated_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {hasInsight && (
                    <HealthRing score={item.insights!.health_score} />
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => generate(item.connection_id, item.connection_name)}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 transition hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-wait"
                    >
                      <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                      {isGenerating ? "Analyzing…" : hasInsight ? "Regenerate" : "Analyze"}
                    </button>
                    {hasInsight && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : item.connection_id)}
                        className="rounded-lg border border-white/[0.08] p-1.5 text-slate-500 transition hover:text-white"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary bar (always visible if insight exists) */}
                {hasInsight && (
                  <div className="border-t border-white/[0.05] bg-white/[0.01] px-5 py-3">
                    <p className="text-sm text-slate-400 leading-relaxed">{item.insights!.summary}</p>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && hasInsight && (
                  <div className="border-t border-white/[0.05] px-5 py-4 space-y-5">
                    {/* Anomalies */}
                    {item.insights!.anomalies?.length > 0 && (
                      <section>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Anomalies
                        </h3>
                        <div className="space-y-2">
                          {item.insights!.anomalies.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
                              <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${a.severity === "error" ? "text-red-400" : "text-yellow-400"}`} />
                              <p className="text-sm text-slate-300">{a.description}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Recommendations */}
                    {item.insights!.recommendations?.length > 0 && (
                      <section>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Recommendations
                        </h3>
                        <div className="space-y-2">
                          {item.insights!.recommendations.map((rec, i) => (
                            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                              <div className="flex items-center gap-2 mb-1">
                                {categoryIcons[rec.category]}
                                <span className="text-sm font-medium text-slate-200">{rec.title}</span>
                                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${impactBadge[rec.impact]}`}>
                                  {rec.impact} impact
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed">{rec.description}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Table observations */}
                    {item.insights!.tables?.length > 0 && (
                      <section>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <Layers className="h-3.5 w-3.5 text-blue-400" /> Table Observations
                        </h3>
                        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Table</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Observation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.insights!.tables.map((t, i) => (
                                <tr key={i} className={`border-b border-white/[0.04] ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                                  <td className="px-4 py-2.5">
                                    <span className="font-jetbrains text-xs text-slate-300">{t.name}</span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`text-xs ${severityColor[t.severity] ?? "text-slate-400"}`}>{t.observation}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    <p className="text-[10px] text-slate-700">
                      Analyzed by {item.model} · {item.generated_at ? new Date(item.generated_at).toLocaleString() : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
