import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtDuration, timeAgo, type RunLog } from "@/lib/e2e-mock";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

// Soft pass/fail progress background (same treatment as the Tests-tab module headers):
// full green when nothing failed, else a blended green→red gradient at the pass rate.
const GREEN = "color-mix(in oklab, var(--color-success) 24%, var(--color-card))";
const RED = "color-mix(in oklab, var(--color-destructive) 22%, var(--color-card))";
const TRACK = "var(--color-surface-muted)";
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export function HistoryTab({ runs }: { runs: RunLog[] }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin bg-background">
      <div className="mx-auto w-full max-w-5xl space-y-3 px-6 py-6">
        {runs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            No runs yet. Run some tests to build history.
          </div>
        )}
        {[...runs].reverse().map((r) => (
          <RunCard key={r.runId} run={r} />
        ))}
      </div>
    </div>
  );
}

function RunCard({ run }: { run: RunLog }) {
  const [open, setOpen] = useState(false);
  const [openErrors, setOpenErrors] = useState<Set<string>>(new Set());

  const toggleError = (id: string) => {
    setOpenErrors((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const { passed, failed, skipped } = run.summary;
  const ran = passed + failed;
  const rate = ran ? Math.round((passed / ran) * 100) : 0;
  const bl = 11; // blend half-width
  const headerBg =
    ran === 0
      ? TRACK
      : failed === 0
      ? GREEN
      : `linear-gradient(100deg, ${GREEN} 0%, ${GREEN} ${clampPct(rate - bl)}%, ${RED} ${clampPct(rate + bl)}%, ${RED} 100%)`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-3.5 transition hover:brightness-[0.98]"
        style={{ background: headerBg }}
        title={`${passed} passed · ${failed} failed · ${skipped} skipped`}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">{timeAgo(run.finishedAt)}</span>
        <div className="flex items-center gap-3 text-xs">
          <Chip tone="success">{passed} passed</Chip>
          <Chip tone="danger">{failed} failed</Chip>
          <Chip tone="muted">{skipped} skipped</Chip>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold tabular-nums"
            style={{ color: rate >= 80 ? "var(--color-success)" : rate >= 50 ? "var(--color-warning)" : "var(--color-destructive)", background: "var(--color-surface-muted)" }}
            title="pass rate (passed of run)"
          >
            {rate}%
          </span>
        </div>
        <span className="ml-auto flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
          <span>{run.baseURL}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5">
            {run.headed ? "headed" : "headless"}
          </span>
          <span>{fmtDuration(run.summary.durationMs)}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          {run.tests.map((t) => (
            <div key={t.id} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span className="font-mono text-[13px] font-medium text-primary">{t.id}</span>
                <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {t.file}
                </span>
                <StatusBadge status={t.status} />
                {t.error && (
                  <button
                    onClick={() => toggleError(t.id)}
                    className="text-[11px] font-medium text-destructive hover:underline"
                  >
                    {openErrors.has(t.id) ? "hide error" : "view error"}
                  </button>
                )}
              </div>
              {t.error && openErrors.has(t.id) && (
                <pre className="mx-5 mb-3 overflow-x-auto rounded-lg border border-border bg-[var(--color-console-bg)] p-3 font-mono text-[12px] leading-relaxed text-[var(--color-destructive)]">
                  {t.error}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger" | "muted";
}) {
  const map = {
    success:
      "bg-[color-mix(in_oklab,var(--color-success)_15%,transparent)] text-[var(--color-success)]",
    danger:
      "bg-[color-mix(in_oklab,var(--color-destructive)_15%,transparent)] text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-medium", map[tone])}>
      {children}
    </span>
  );
}
