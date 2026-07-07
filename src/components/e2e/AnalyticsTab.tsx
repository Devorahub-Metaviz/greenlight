import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock, PlayCircle, TrendingUp } from "lucide-react";
import { fmtDuration, timeAgo, type RunLog, type TestItem } from "@/lib/e2e-mock";
import { cn } from "@/lib/utils";

interface Props {
  tests: TestItem[];
  runs: RunLog[]; // oldest-first
}

type Range = "3d" | "7d" | "30d" | "60d" | "all";
const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: "3d", label: "3 days", days: 3 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "60d", label: "60 days", days: 60 },
  { key: "all", label: "all time", days: null },
];

// Softer chart fills — blend the semantic color toward the card surface.
const SOFT_PASS = "color-mix(in oklab, var(--color-success) 62%, var(--color-card))";
const SOFT_FAIL = "color-mix(in oklab, var(--color-destructive) 55%, var(--color-card))";
const SOFT_SKIP = "color-mix(in oklab, var(--color-muted-foreground) 30%, var(--color-card))";

export function AnalyticsTab({ tests, runs }: Props) {
  const [range, setRange] = useState<Range>("7d");
  const days = RANGES.find((r) => r.key === range)!.days;

  const scopedRuns = useMemo(() => {
    if (days == null) return runs;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return runs.filter((r) => r.finishedAt >= cutoff);
  }, [runs, days]);

  const kpi = useMemo(() => {
    const passed = tests.filter((t) => t.lastStatus === "passed").length;
    const failed = tests.filter((t) => t.lastStatus === "failed").length;
    const withRun = passed + failed;
    const passRate = withRun ? Math.round((passed / withRun) * 100) : 0;
    const avg = scopedRuns.length ? scopedRuns.reduce((a, r) => a + r.summary.durationMs, 0) / scopedRuns.length : 0;
    const last = scopedRuns[scopedRuns.length - 1];
    return { total: tests.length, passed, failed, passRate, runs: scopedRuns.length, avg, lastAt: last ? last.finishedAt : null };
  }, [tests, scopedRuns]);

  const trend = useMemo(() => scopedRuns.slice(-14), [scopedRuns]);
  const maxTotal = Math.max(1, ...trend.map((r) => r.summary.total));

  const modules = useMemo(() => {
    const map = new Map<string, { passed: number; failed: number; total: number }>();
    for (const t of tests) {
      const m = map.get(t.module) ?? { passed: 0, failed: 0, total: 0 };
      m.total++;
      if (t.lastStatus === "passed") m.passed++;
      else if (t.lastStatus === "failed") m.failed++;
      map.set(t.module, m);
    }
    return [...map.entries()]
      .map(([module, v]) => ({ module, ...v, rate: v.passed + v.failed ? Math.round((v.passed / (v.passed + v.failed)) * 100) : 0 }))
      .sort((a, b) => a.rate - b.rate);
  }, [tests]);

  const flaky = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of scopedRuns) for (const t of r.tests) if (t.status === "failed") count.set(t.id, (count.get(t.id) ?? 0) + 1);
    return [...count.entries()].map(([id, fails]) => ({ id, fails })).sort((a, b) => b.fails - a.fails).slice(0, 8);
  }, [scopedRuns]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-6">
        {/* Range selector */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Analytics</h2>
          <div className="inline-flex h-9 items-center rounded-lg border border-border bg-surface p-0.5">
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={cn("h-full rounded-md px-3 text-xs font-medium transition", range === r.key ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="pass rate" value={`${kpi.passRate}%`} tone="success" />
          <Kpi icon={<Activity className="h-4 w-4" />} label="total tests" value={kpi.total} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="failing" value={kpi.failed} tone={kpi.failed ? "danger" : undefined} />
          <Kpi icon={<PlayCircle className="h-4 w-4" />} label="runs" value={kpi.runs} />
          <Kpi icon={<Clock className="h-4 w-4" />} label="avg run" value={kpi.avg ? fmtDuration(Math.round(kpi.avg)) : "—"} />
        </div>

        {/* Run trend */}
        <Card title="Run trend" subtitle={kpi.lastAt ? `last run ${timeAgo(kpi.lastAt)}` : "no runs in range"}>
          {trend.length === 0 ? (
            <Empty>No runs in this range.</Empty>
          ) : (
            <div className="flex items-end gap-2 pt-2" style={{ height: 160 }}>
              {trend.map((r) => {
                const h = (n: number) => `${(n / maxTotal) * 130}px`;
                return (
                  <div key={r.runId} className="group flex flex-1 flex-col items-center gap-1.5" title={`${r.summary.passed} passed · ${r.summary.failed} failed · ${r.summary.skipped} skipped`}>
                    <div className="flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-md">
                      <div style={{ height: h(r.summary.passed), background: SOFT_PASS }} className="w-full" />
                      <div style={{ height: h(r.summary.failed), background: SOFT_FAIL }} className="w-full" />
                      <div style={{ height: h(r.summary.skipped), background: SOFT_SKIP }} className="w-full" />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{timeAgo(r.finishedAt).replace(" ago", "")}</span>
                  </div>
                );
              })}
            </div>
          )}
          <Legend />
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Module health */}
          <Card title="Module health" subtitle="pass rate per module">
            {modules.length === 0 ? <Empty>No tests.</Empty> : (
              <div className="space-y-3 pt-1">
                {modules.map((m) => (
                  <div key={m.module}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-foreground">{m.module}</span>
                      <span className="text-muted-foreground">{m.rate}% · {m.total} test{m.total === 1 ? "" : "s"}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${m.rate}%`, background: m.rate >= 80 ? SOFT_PASS : m.rate >= 50 ? "color-mix(in oklab, var(--color-warning) 55%, var(--color-card))" : SOFT_FAIL }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Flaky / failing */}
          <Card title="Most failing tests" subtitle="failures in range">
            {flaky.length === 0 ? <Empty>No failures recorded. Nice.</Empty> : (
              <div className="divide-y divide-border pt-1">
                {flaky.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-mono text-[13px] font-medium text-primary">{f.id}</span>
                    <span className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-destructive" style={{ background: "color-mix(in oklab, var(--color-destructive) 12%, transparent)" }}>{f.fails} fail{f.fails === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className={cn("mb-2 flex h-7 w-7 items-center justify-center rounded-lg", tone === "success" ? "text-[var(--color-success)]" : tone === "danger" ? "text-destructive" : "text-primary")}
        style={{ background: tone === "success" ? "color-mix(in oklab, var(--color-success) 12%, transparent)" : tone === "danger" ? "color-mix(in oklab, var(--color-destructive) 12%, transparent)" : "var(--color-accent)" }}>
        {icon}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SOFT_PASS }} /> passed</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SOFT_FAIL }} /> failed</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SOFT_SKIP }} /> skipped</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{children}</div>;
}
