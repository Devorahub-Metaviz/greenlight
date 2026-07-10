import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, PanelRightClose, PanelRightOpen, Play, Search, Square } from "lucide-react";
import { fmtDuration, timeAgo, type RunLog, type TestItem, type TestStatus } from "@/lib/e2e-mock";
import { StatusBadge, StatusDot } from "./StatusBadge";
import { cn } from "@/lib/utils";

export interface BaseUrlOption { label: string; value: string }

interface Props {
  projectName: string;
  tests: TestItem[];
  lastRun: RunLog | undefined;
  baseUrls?: BaseUrlOption[];
  defaultHeaded?: boolean;
  onRun: (
    testIds: string[],
    opts: { headed: boolean; baseURL: string },
    onLine: (line: ConsoleLine) => void,
    onDone: (log: RunLog) => void,
  ) => (() => void) | void;
  onUpdateTestStatus: (id: string, status: TestStatus) => void;
}

export type ConsoleLine = { kind: "cmd" | "info" | "ok" | "err" | "warn"; text: string };

const DEFAULT_BASE_URLS: BaseUrlOption[] = [
  { label: "local · http://localhost:3000", value: "http://localhost:3000" },
];

export function TestsTab({ projectName, tests, lastRun, baseUrls, defaultHeaded = false, onRun }: Props) {
  const BASE_URLS = baseUrls && baseUrls.length ? baseUrls : DEFAULT_BASE_URLS;
  const [query, setQuery] = useState("");
  const [baseURL, setBaseURL] = useState(BASE_URLS[0].value);

  useEffect(() => {
    if (!BASE_URLS.some((b) => b.value === baseURL)) setBaseURL(BASE_URLS[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrls]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showConsole, setShowConsole] = useState(true);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [runSummary, setRunSummary] = useState<string>("");
  const consoleRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const toggleCollapse = (module: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(module)) n.delete(module); else n.add(module); return n; });

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter(
      (t) => !q || t.id.toLowerCase().includes(q) || t.module.toLowerCase().includes(q),
    );
  }, [tests, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, TestItem[]>();
    filtered.forEach((t) => {
      if (!map.has(t.module)) map.set(t.module, []);
      map.get(t.module)!.push(t);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    let passed = 0,
      failed = 0,
      notRun = 0;
    tests.forEach((t) => {
      if (t.lastStatus === "passed") passed++;
      else if (t.lastStatus === "failed") failed++;
      else if (t.lastStatus === "unknown") notRun++;
    });
    return { total: tests.length, passed, failed, notRun };
  }, [tests]);

  const toggleTest = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleModule = (module: string, ids: string[]) => {
    setSelected((prev) => {
      const n = new Set(prev);
      const allIn = ids.every((i) => n.has(i));
      if (allIn) ids.forEach((i) => n.delete(i));
      else ids.forEach((i) => n.add(i));
      void module;
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === tests.length) setSelected(new Set());
    else setSelected(new Set(tests.map((t) => t.id)));
  };

  const doRun = (ids: string[]) => {
    if (!ids.length || running) return;
    setRunning(true);
    setLines([]);
    setRunSummary("");
    const stop = onRun(
      ids,
      { headed: defaultHeaded, baseURL },
      (line) => setLines((prev) => [...prev, line]),
      (log) => {
        setRunning(false);
        stopRef.current = null;
        setRunSummary(
          `${log.summary.passed} passed · ${log.summary.failed} failed · ${log.summary.skipped} skipped · ${fmtDuration(log.summary.durationMs)}`,
        );
      },
    );
    stopRef.current = stop ?? null;
  };

  const doStop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
    setRunSummary("stopped");
  };

  const allChecked = tests.length > 0 && selected.size === tests.length;

  return (
    <div className="flex h-full flex-col">
      {/* Run bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tests or modules…"
            className="h-9 w-72 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <select
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {BASE_URLS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {selected.size} selected
          </span>
          <button
            disabled={running || selected.size === 0}
            onClick={() => doRun(Array.from(selected))}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
          >
            Run selected
          </button>
          {running ? (
            <button
              onClick={doStop}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-90"
            >
              <Square className="h-3.5 w-3.5 fill-white" strokeWidth={0} />
              Stop
            </button>
          ) : (
            <button
              disabled={tests.length === 0}
              onClick={() => doRun(tests.map((t) => t.id))}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-60"
            >
              <Play className="h-4 w-4 fill-white" strokeWidth={0} />
              Run all
            </button>
          )}
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-6 py-3">
        <StatPill label="total" value={stats.total} />
        <StatPill label="passed" value={stats.passed} tone="success" />
        <StatPill label="failed" value={stats.failed} tone="danger" />
        <StatPill label="not run" value={stats.notRun} tone="muted" />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>last run <span className="font-medium text-foreground">{lastRun ? timeAgo(lastRun.finishedAt) : "never"}</span></span>
          <button onClick={() => setShowConsole((v) => !v)} title={showConsole ? "Hide console" : "Show console"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 font-medium transition hover:border-primary/50 hover:text-foreground">
            {showConsole ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            {showConsole ? "Hide console" : "Show console"}
          </button>
        </div>
      </div>

      {/* Two-pane (stacks vertically on small screens) */}
      <div className={cn("grid min-h-0 flex-1 gap-0", showConsole ? "grid-rows-2 lg:grid-cols-2 lg:grid-rows-1" : "grid-cols-1")}>
        {/* Explorer */}
        <div className={cn("flex min-h-0 flex-col", showConsole && "border-b border-border lg:border-b-0 lg:border-r")}>
          <div className="flex items-center justify-between border-b border-border px-6 py-2.5"
            style={{ background: progressBg(tests.length ? (stats.passed / tests.length) * 100 : 0, tests.length ? (stats.failed / tests.length) * 100 : 0) }}>
            <div className="flex items-center gap-2.5">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} title="Select all" className="h-4 w-4" />
              {(() => {
                const allCol = filtered.length > 0 && filtered.every((m) => collapsed.has(m.module));
                return (
                  <button onClick={() => setCollapsed(allCol ? new Set() : new Set(filtered.map((m) => m.module)))}
                    title={allCol ? "Expand all" : "Collapse all"}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-black/5 hover:text-foreground">
                    {allCol ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                  </button>
                );
              })()}
            </div>
            <span className="flex items-center gap-3">
              {(running || stats.passed + stats.failed > 0) && (
                <span className="flex items-center gap-2 text-[11px] font-medium">
                  <span className="text-[var(--color-success)]">{stats.passed} pass</span>
                  {stats.failed > 0 && <span className="text-destructive">{stats.failed} fail</span>}
                  <span className="tabular-nums text-foreground/70">{stats.passed + stats.failed ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100) : 0}%</span>
                </span>
              )}
              <span className="font-mono text-[11px] text-muted-foreground">{projectName}/e2e</span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
            {grouped.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <div className="font-mono">no tests match "{query}"</div>
              </div>
            )}
            {grouped.map(([module, items]) => {
              const ids = items.map((i) => i.id);
              const allIn = ids.every((i) => selected.has(i));
              const someIn = !allIn && ids.some((i) => selected.has(i));
              const isCollapsed = collapsed.has(module);
              const passed = items.filter((i) => i.lastStatus === "passed").length;
              const failed = items.filter((i) => i.lastStatus === "failed").length;
              const total = items.length;
              const passPct = total ? (passed / total) * 100 : 0;
              const failPct = total ? (failed / total) * 100 : 0;
              void passPct; void failPct;
              const ran = passed + failed;
              const rate = ran ? Math.round((passed / ran) * 100) : 0;
              // Header bg is the progress bar based on pass/fail rate (skipped/not-run ignored).
              // No failures -> full green; otherwise a soft green→red blend (no hard line).
              const GREEN = "color-mix(in oklab, var(--color-success) 24%, var(--color-card))";
              const RED = "color-mix(in oklab, var(--color-destructive) 22%, var(--color-card))";
              const TRACK = "var(--color-surface-muted)";
              const clamp = (n: number) => Math.max(0, Math.min(100, n));
              const bl = 11; // blend half-width
              const headerBg = ran === 0
                ? TRACK
                : failed === 0
                ? GREEN
                : `linear-gradient(100deg, ${GREEN} 0%, ${GREEN} ${clamp(rate - bl)}%, ${RED} ${clamp(rate + bl)}%, ${RED} 100%)`;
              return (
                <div
                  key={module}
                  className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-soft"
                >
                  <div onClick={() => toggleCollapse(module)}
                    className={cn("flex cursor-pointer select-none items-center gap-2.5 px-3 py-2.5", !isCollapsed && "border-b border-border")} style={{ background: headerBg }}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground">
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                    <input
                      type="checkbox"
                      checked={allIn}
                      ref={(el) => {
                        if (el) el.indeterminate = someIn;
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleModule(module, ids)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-sm font-semibold text-foreground">{module}</span>
                    <span className="rounded-md bg-card/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{items.length}</span>
                    <span className="ml-auto flex items-center gap-2.5 text-[11px] font-medium">
                      <span className="text-[var(--color-success)]">{passed} pass</span>
                      {failed > 0 && <span className="text-destructive">{failed} fail</span>}
                      <span className="tabular-nums text-foreground/70">{rate}%</span>
                      <button onClick={(e) => { e.stopPropagation(); doRun(ids); }} disabled={running} title={`Run ${module}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-primary transition hover:bg-black/5 disabled:opacity-40">
                        <Play className="h-4 w-4 fill-current" strokeWidth={0} />
                      </button>
                    </span>
                  </div>
                  <div className={cn(isCollapsed && "hidden")}>
                    {groupByFeature(items).map(({ feature, tests: fTests }) => (
                      <div key={feature ?? "_none"}>
                        {feature && (
                          <div className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-1.5 pl-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> {feature}
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium normal-case">{fTests.length}</span>
                            <button onClick={() => doRun(fTests.map((t) => t.id))} disabled={running} title={`Run ${feature}`}
                              className="ml-auto flex h-5 w-5 items-center justify-center rounded text-primary transition hover:bg-black/5 disabled:opacity-40">
                              <Play className="h-3 w-3 fill-current" strokeWidth={0} />
                            </button>
                          </div>
                        )}
                        {fTests.map((t) => {
                          const isSel = selected.has(t.id);
                          return (
                            <label key={t.id}
                              className={cn("flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 transition", feature && "pl-10", isSel ? "bg-accent/60" : "hover:bg-surface-muted")}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleTest(t.id)} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
                              <span className="font-mono text-[13px] font-medium text-primary">{t.id}</span>
                              <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">{t.file}</span>
                              <StatusBadge status={t.lastStatus} />
                              <span className="w-16 text-right text-[11px] text-muted-foreground">{timeAgo(t.lastRunAt)}</span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Console */}
        {showConsole && (
        <div className="flex min-h-0 flex-col bg-[var(--color-console-bg)]">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="font-mono text-xs text-white/60">console</span>
            <span className="ml-auto font-mono text-[11px] text-white/50">
              {running ? (
                <span className="flex items-center gap-1.5 text-[var(--color-warning)]">
                  <StatusDot status="running" />
                  running
                </span>
              ) : (
                runSummary || "idle"
              )}
            </span>
          </div>
          <div
            ref={consoleRef}
            className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--color-console-fg)]"
          >
            {lines.length === 0 ? (
              <div className="text-white/40">$ waiting for a run… select tests and hit Run.</div>
            ) : (
              lines.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap",
                    l.kind === "cmd" && "text-[color-mix(in_oklab,var(--color-primary)_60%,white)]",
                    l.kind === "ok" && "text-[var(--color-success)]",
                    l.kind === "err" && "text-[var(--color-destructive)]",
                    l.kind === "warn" && "text-[var(--color-warning)]",
                    l.kind === "info" && "text-white/80",
                  )}
                >
                  {l.text}
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// Group a module's tests by feature (no-feature bucket first, order of first appearance).
function groupByFeature(tests: TestItem[]): { feature: string | null; tests: TestItem[] }[] {
  const order: (string | null)[] = [];
  for (const t of tests) { const f = t.feature ?? null; if (!order.includes(f)) order.push(f); }
  return order.map((f) => ({ feature: f, tests: tests.filter((t) => (t.feature ?? null) === f) }));
}

// Soft, blended progress-bar background: green (pass) → red (fail) → track (not run/running).
function progressBg(passPct: number, failPct: number): string {
  const GREEN = "color-mix(in oklab, var(--color-success) 22%, var(--color-card))";
  const RED = "color-mix(in oklab, var(--color-destructive) 20%, var(--color-card))";
  const TRACK = "var(--color-surface)";
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const bl = 9;
  const pf = passPct + failPct;
  if (pf <= 0) return TRACK;
  const stops: string[] = [`${GREEN} 0%`];
  if (failPct > 0 || pf < 100) stops.push(`${GREEN} ${clamp(passPct - bl)}%`); else stops.push(`${GREEN} 100%`);
  if (failPct > 0) {
    stops.push(`${RED} ${clamp(passPct + bl)}%`);
    stops.push(`${RED} ${pf < 100 ? clamp(pf - bl) : 100}%`);
  }
  if (pf < 100) {
    stops.push(`${TRACK} ${clamp(pf + bl)}%`);
    stops.push(`${TRACK} 100%`);
  }
  return `linear-gradient(100deg, ${stops.join(", ")})`;
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger" | "muted";
}) {
  const toneMap = {
    success:
      "bg-[color-mix(in_oklab,var(--color-success)_15%,transparent)] text-[var(--color-success)]",
    danger:
      "bg-[color-mix(in_oklab,var(--color-destructive)_15%,transparent)] text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        tone ? toneMap[tone] : "bg-surface-muted text-foreground border border-border",
      )}
    >
      <span className="tabular-nums font-semibold">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}
