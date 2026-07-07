// Spawn Playwright for a selection of specs, stream output, and write a run log.
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { RunLog, RunTestResult, TestStatus } from "./types";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function nowRunId(): string {
  // e.g. 2026-07-06T10-22-33-123Z
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface RunOptions {
  projectPath: string;
  selection: string[];   // relative spec paths; empty = run all
  headed: boolean;
  baseURL: string;
  workers?: number | null;
  retries?: number | null;
  onLine?: (line: string) => void;
}

// --- Playwright JSON report -> our normalized results -----------------------

interface PwResult {
  status: string;
  duration: number;
  error?: { message?: string };
}
interface PwTest {
  results: PwResult[];
}
interface PwSpec {
  title: string;
  ok: boolean;
  file?: string;
  tests: PwTest[];
}
interface PwSuite {
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  suites?: PwSuite[];
}

function toStatus(statuses: string[]): TestStatus {
  if (statuses.some((s) => s === "failed" || s === "unexpected")) return "failed";
  if (statuses.some((s) => s === "timedOut")) return "timedout";
  if (statuses.length > 0 && statuses.every((s) => s === "skipped")) return "skipped";
  if (statuses.length === 0) return "unknown";
  return "passed";
}

function walkSpecs(suite: PwSuite, parentFile: string | undefined, out: { file: string; spec: PwSpec }[]) {
  const file = suite.file ?? parentFile;
  for (const spec of suite.specs ?? []) {
    out.push({ file: spec.file ?? file ?? "", spec });
  }
  for (const child of suite.suites ?? []) {
    walkSpecs(child, file, out);
  }
}

// e2e/<module>/<id>.spec.ts -> { module, id } (also e2e/<module>/<feature>/<id>.spec.ts).
function deriveIdModule(file: string): { module: string; id: string } {
  const segments = file.replace(/^e2e\//, "").split("/");
  const module = segments.length > 1 ? segments[0] : "(root)";
  const base = segments[segments.length - 1] ?? "";
  const id = base.replace(/\.spec\.(ts|tsx|js|jsx|mjs)$/, "");
  return { module, id };
}

function normalize(report: PwReport, projectPath: string): RunTestResult[] {
  const flat: { file: string; spec: PwSpec }[] = [];
  for (const s of report.suites ?? []) walkSpecs(s, undefined, flat);

  // Aggregate by file (our convention: 1 file = 1 test case, but a file may hold several tests).
  const byFile = new Map<string, { statuses: string[]; duration: number; error: string | null }>();
  for (const { file, spec } of flat) {
    let rel = file;
    if (path.isAbsolute(file)) rel = path.relative(projectPath, file);
    rel = rel.split(path.sep).join("/");
    // Playwright reports spec paths relative to testDir (e2e); normalize to project-root-relative
    // so they match the paths listTests() produces (e2e/<module>/<id>.spec.ts).
    if (!rel.startsWith("e2e/")) rel = `e2e/${rel}`;
    const entry = byFile.get(rel) ?? { statuses: [], duration: 0, error: null };
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        entry.statuses.push(r.status);
        entry.duration += r.duration ?? 0;
        if (!entry.error && r.error?.message) entry.error = stripAnsi(r.error.message).trim();
      }
    }
    byFile.set(rel, entry);
  }

  const results: RunTestResult[] = [];
  for (const [file, e] of byFile) {
    const { module, id } = deriveIdModule(file);
    results.push({
      id,
      file,
      module,
      status: toStatus(e.statuses),
      durationMs: Math.round(e.duration),
      error: e.error,
    });
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function runTests(opts: RunOptions): Promise<RunLog> {
  const { projectPath, selection, headed, baseURL, workers, retries, onLine } = opts;
  const runId = nowRunId();
  const startedAt = new Date().toISOString();
  const logsDirPath = path.join(projectPath, "e2e", "logs");
  await fs.mkdir(logsDirPath, { recursive: true });
  const jsonOut = path.join(logsDirPath, `.raw-${runId}.json`);

  const emit = (l: string) => onLine?.(stripAnsi(l).replace(/\r$/, ""));

  // A selected spec's file can vanish between the client's test list load and
  // this run (deleted on disk, moved, etc). Passing a missing path straight to
  // Playwright just produces a generic "no tests found" - check first so each
  // one gets a clear, specific warning and never blocks the tests that do exist.
  const missingResults: RunTestResult[] = [];
  let existingSelection = selection;
  if (selection.length > 0) {
    existingSelection = [];
    for (const file of selection) {
      if (await fileExists(path.join(projectPath, file))) {
        existingSelection.push(file);
      } else {
        const { module, id } = deriveIdModule(file);
        emit(`⚠ ${file} not found on disk - its script is missing, skipping this test`);
        missingResults.push({ id, file, module, status: "skipped", durationMs: 0, error: "Script file not found - it may have been deleted or moved." });
      }
    }
    if (existingSelection.length === 0) {
      emit("No selected tests have a script file on disk - nothing to run.");
      const finishedAt = new Date().toISOString();
      const summary = { total: missingResults.length, passed: 0, failed: 0, skipped: missingResults.length, durationMs: 0 };
      const log: RunLog = { runId, startedAt, finishedAt, baseURL, headed, selection, summary, tests: missingResults };
      await fs.writeFile(path.join(logsDirPath, `run-${runId}.json`), JSON.stringify(log, null, 2), "utf8");
      return log;
    }
  }

  const args = ["playwright", "test", ...existingSelection];
  if (headed) args.push("--headed");
  if (typeof workers === "number") args.push(`--workers=${workers}`);
  if (typeof retries === "number") args.push(`--retries=${retries}`);
  args.push("--reporter=list,json");

  emit(`$ npx ${args.join(" ")}`);
  emit(`baseURL=${baseURL} headed=${headed}`);

  const exitCode: number = await new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd: projectPath,
      shell: true,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseURL,
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut,
        CI: "1",
        FORCE_COLOR: "0",
      },
    });
    let bufOut = "";
    let bufErr = "";
    const pump = (chunk: string, which: "out" | "err") => {
      let buf = which === "out" ? bufOut + chunk : bufErr + chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) emit(l);
      if (which === "out") bufOut = buf;
      else bufErr = buf;
    };
    child.stdout.on("data", (d) => pump(d.toString(), "out"));
    child.stderr.on("data", (d) => pump(d.toString(), "err"));
    child.on("close", (code) => {
      if (bufOut) emit(bufOut);
      if (bufErr) emit(bufErr);
      resolve(code ?? 1);
    });
    child.on("error", (err) => {
      emit(`spawn error: ${err.message}`);
      resolve(1);
    });
  });

  const finishedAt = new Date().toISOString();

  let tests: RunTestResult[] = [];
  try {
    const raw = await fs.readFile(jsonOut, "utf8");
    tests = normalize(JSON.parse(raw) as PwReport, projectPath);
    await fs.unlink(jsonOut).catch(() => {});
  } catch {
    emit(`could not read JSON report (exit ${exitCode})`);
  }
  tests = [...tests, ...missingResults];

  const summary = {
    total: tests.length,
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed" || t.status === "timedout").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
    durationMs: tests.reduce((a, t) => a + t.durationMs, 0),
  };

  const log: RunLog = {
    runId,
    startedAt,
    finishedAt,
    baseURL,
    headed,
    selection,
    summary,
    tests,
  };

  await fs.writeFile(path.join(logsDirPath, `run-${runId}.json`), JSON.stringify(log, null, 2), "utf8");
  emit(`\nDone. passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`);
  return log;
}
