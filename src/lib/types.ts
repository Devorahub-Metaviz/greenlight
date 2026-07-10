// Shared types for the E2E orchestrator.

export type Priority = "high" | "medium" | "low";
export type ChecklistStatus = "open" | "in-progress" | "done" | "blocked";
export type TestStatus = "passed" | "failed" | "skipped" | "timedout" | "stale" | "unknown";
export type TestRuntime = "playwright" | "pytest";

export interface ChecklistItem {
  id: string;            // test case code, e.g. "login-1"
  title: string;
  module: string;        // e.g. "auth"
  feature?: string;      // optional sub-group, e.g. "login"
  tests: string[];       // spec paths relative to project root, e.g. "e2e/auth/login/login-1.spec.ts"
  priority: Priority;
  status: ChecklistStatus;
}

export interface SqaFile {
  project: string;
  checklist: ChecklistItem[];
  modules?: Record<string, string>; // module name -> description
}

export interface UrlPresets {
  presets: Record<string, string>;
  default: string;
}

export interface TestCase {
  id: string;            // spec basename without extension, e.g. "login-1"
  module: string;        // first folder under e2e/
  feature?: string;      // optional second folder under e2e/<module>/
  file: string;          // relative path, e.g. "e2e/auth/login/login-1.spec.ts"
  runtime: TestRuntime;  // which runner executes this file
}

export interface ModuleGroup {
  module: string;
  tests: TestCase[];
}

export interface Project {
  id: string;            // folder name (slug)
  name: string;          // folder name
  path: string;          // absolute path
  hasE2e: boolean;
  hasSqa: boolean;
}

export interface RunTestResult {
  id: string;
  file: string;
  module: string;
  status: TestStatus;
  durationMs: number;
  error: string | null;
}

export interface RunLog {
  runId: string;         // timestamp-based id, e.g. 2026-07-06T10-22-33Z
  startedAt: string;
  finishedAt: string;
  baseURL: string;
  headed: boolean;
  selection: string[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  tests: RunTestResult[];
}

// Per-test rollup derived from the log history.
export interface TestHistory {
  file: string;
  lastStatus: TestStatus;
  lastRunAt: string | null;
  lastBrokeAt: string | null;   // most recent run where this test failed
}
