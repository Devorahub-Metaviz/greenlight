// Shared UI types + formatters used by the e2e/* view components.
// (Ported from the Lovable design; data now comes from the real backend, not mocks.)

export type TestStatus = "passed" | "failed" | "skipped" | "unknown" | "running";
export type Priority = "high" | "medium" | "low";

export interface Project {
  id: string;
  name: string;
  hasSqa: boolean;
}

export interface TestItem {
  id: string;
  module: string;
  feature?: string;
  file: string;
  lastStatus: TestStatus;
  lastRunAt: number | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  module: string;
  feature?: string;
  tests: string[];
  priority: Priority;
  status: "todo" | "done";
}

export interface RunLog {
  runId: string;
  finishedAt: number;
  baseURL: string;
  headed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  tests: { id: string; file: string; status: TestStatus; error?: string }[];
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
