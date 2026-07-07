// Read run logs from e2e/logs/ and compute per-test history rollups.
import { promises as fs } from "fs";
import path from "path";
import type { RunLog, TestHistory, TestStatus } from "./types";

function logsDir(projectPath: string): string {
  return path.join(projectPath, "e2e", "logs");
}

// Return all run logs, newest first (by runId, which is timestamp-based).
export async function readRuns(projectPath: string): Promise<RunLog[]> {
  const dir = logsDir(projectPath);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const runs: RunLog[] = [];
  for (const f of files) {
    if (!f.startsWith("run-") || !f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), "utf8");
      runs.push(JSON.parse(raw) as RunLog);
    } catch {
      // skip corrupt log
    }
  }
  runs.sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0));
  return runs;
}

// Per-test-file rollup: latest status + last run time + last time it failed.
export async function computeHistory(projectPath: string): Promise<Record<string, TestHistory>> {
  const runs = await readRuns(projectPath); // newest first
  const rollup: Record<string, TestHistory> = {};

  for (const run of runs) {
    for (const t of run.tests) {
      const existing = rollup[t.file];
      if (!existing) {
        rollup[t.file] = {
          file: t.file,
          lastStatus: t.status as TestStatus,
          lastRunAt: run.finishedAt || run.startedAt || null,
          lastBrokeAt: t.status === "failed" || t.status === "timedout" ? run.finishedAt || run.startedAt : null,
        };
      } else if (!existing.lastBrokeAt && (t.status === "failed" || t.status === "timedout")) {
        existing.lastBrokeAt = run.finishedAt || run.startedAt;
      }
    }
  }
  return rollup;
}
