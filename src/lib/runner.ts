// Spawn Playwright and/or pytest for a selection of tests, stream output, and
// write a run log. A project can mix both runtimes (e2e/<module>/<id>.spec.ts
// for Playwright, e2e/<Module>/tc<n>_<slug>.py for pytest) - each file in the
// selection is routed to the runner that owns its extension.
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import type { RunLog, RunTestResult, TestStatus } from "./types";
import { listTests } from "./tests";

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
  selection: string[];   // relative test paths; empty = run all
  headed: boolean;
  baseURL: string;
  workers?: number | null;
  retries?: number | null;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

// `shell: true` spawns the child via cmd.exe on Windows, so the child's own
// pid is cmd.exe, not the node/python process underneath it - killing just
// that pid leaves the real run (and its workers) orphaned and still running.
// taskkill's /t walks the whole process tree started from that pid.
function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"]);
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { /* process already gone */ }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// e2e/<module>/<id>.ext -> { module, id } (also e2e/<module>/<feature>/<id>.ext).
function deriveIdModule(file: string): { module: string; id: string } {
  const segments = file.replace(/^e2e\//, "").split("/");
  const module = segments.length > 1 ? segments[0] : "(root)";
  const base = segments[segments.length - 1] ?? "";
  const id = base.replace(/\.spec\.(ts|tsx|js|jsx|mjs)$/, "").replace(/\.py$/i, "");
  return { module, id };
}

// Run a child process to completion, streaming stdout/stderr line-by-line
// through `emit` and honoring an abort signal by killing the whole tree.
function runProcess(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; emit: (l: string) => void; signal?: AbortSignal }): Promise<number> {
  const { cwd, env, emit, signal } = opts;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: true,
      detached: process.platform !== "win32", // lets killTree signal the whole group on POSIX
      env,
    });
    let bufOut = "";
    let bufErr = "";
    let settled = false;
    const finish = (code: number) => { if (!settled) { settled = true; resolve(code); } };
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
      finish(code ?? 1);
    });
    child.on("error", (err) => {
      emit(`spawn error: ${err.message}`);
      finish(1);
    });

    if (signal) {
      const stop = () => { emit("\n⏹ Run stopped by user."); killTree(child.pid); };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    }
  });
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

function pwStatus(statuses: string[]): TestStatus {
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

function normalizePlaywright(report: PwReport, projectPath: string): RunTestResult[] {
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
      status: pwStatus(e.statuses),
      durationMs: Math.round(e.duration),
      error: e.error,
    });
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

async function runPlaywright(
  files: string[],
  opts: { projectPath: string; headed: boolean; baseURL: string; workers?: number | null; retries?: number | null; emit: (l: string) => void; signal?: AbortSignal }
): Promise<RunTestResult[]> {
  const { projectPath, headed, baseURL, workers, retries, emit, signal } = opts;
  const runId = nowRunId();
  const logsDirPath = path.join(projectPath, "e2e", "logs");
  await fs.mkdir(logsDirPath, { recursive: true });
  const jsonOut = path.join(logsDirPath, `.raw-pw-${runId}.json`);

  const args = ["playwright", "test", ...files];
  if (headed) args.push("--headed");
  if (typeof workers === "number") args.push(`--workers=${workers}`);
  if (typeof retries === "number") args.push(`--retries=${retries}`);
  args.push("--reporter=list,json");

  emit(`\n=== Playwright ===`);
  emit(`$ npx ${args.join(" ")}`);
  emit(`baseURL=${baseURL} headed=${headed}`);

  const exitCode = await runProcess("npx", args, {
    cwd: projectPath,
    emit,
    signal,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut,
      CI: "1",
      FORCE_COLOR: "0",
    },
  });

  try {
    const raw = await fs.readFile(jsonOut, "utf8");
    const results = normalizePlaywright(JSON.parse(raw) as PwReport, projectPath);
    await fs.unlink(jsonOut).catch(() => {});
    return results;
  } catch {
    emit(`could not read Playwright JSON report (exit ${exitCode})`);
    return [];
  }
}

// --- pytest JUnit XML report -> our normalized results ----------------------

interface JUnitTestcase {
  "@_classname"?: string;
  "@_name"?: string;
  "@_time"?: string;
  "@_file"?: string;
  failure?: { "@_message"?: string; "#text"?: string } | Array<{ "@_message"?: string; "#text"?: string }>;
  error?: { "@_message"?: string; "#text"?: string } | Array<{ "@_message"?: string; "#text"?: string }>;
  skipped?: { "@_message"?: string; "#text"?: string } | Array<{ "@_message"?: string; "#text"?: string }>;
}
interface JUnitTestsuite {
  testcase?: JUnitTestcase | JUnitTestcase[];
}
interface JUnitReport {
  testsuites?: { testsuite?: JUnitTestsuite | JUnitTestsuite[] };
  testsuite?: JUnitTestsuite; // some pytest versions emit a bare <testsuite> root
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function firstMessage(v: JUnitTestcase["failure"]): string | null {
  const item = asArray(v)[0];
  if (!item) return null;
  return (item["@_message"] ?? item["#text"] ?? "").toString().trim() || null;
}

function normalizePytest(xml: string, projectPath: string): RunTestResult[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", htmlEntities: true });
  const parsed = parser.parse(xml) as JUnitReport;
  const suites = asArray(parsed.testsuites?.testsuite ?? parsed.testsuite);

  const results: RunTestResult[] = [];
  for (const suite of suites) {
    for (const tc of asArray(suite.testcase)) {
      let file = tc["@_file"];
      if (file) {
        if (path.isAbsolute(file)) file = path.relative(projectPath, file);
        file = file.split(path.sep).join("/");
        if (!file.startsWith("e2e/")) file = `e2e/${file}`;
      } else {
        // Fallback: pytest's classname mirrors the path with dots, e.g. "e2e.Authentication.tc01_foo"
        file = `${(tc["@_classname"] ?? "unknown").replace(/\./g, "/")}.py`;
      }
      const { module, id } = deriveIdModule(file);

      let status: TestStatus = "passed";
      let error: string | null = null;
      if (tc.failure !== undefined || tc.error !== undefined) {
        status = "failed";
        error = firstMessage(tc.failure) ?? firstMessage(tc.error);
      } else if (tc.skipped !== undefined) {
        status = "skipped";
        error = firstMessage(tc.skipped);
      }

      results.push({
        id,
        file,
        module,
        status,
        durationMs: Math.round(parseFloat(tc["@_time"] ?? "0") * 1000),
        error,
      });
    }
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

async function runPytest(
  files: string[],
  opts: { projectPath: string; headed: boolean; baseURL: string; emit: (l: string) => void; signal?: AbortSignal }
): Promise<RunTestResult[]> {
  const { projectPath, headed, baseURL, emit, signal } = opts;
  const runId = nowRunId();
  const logsDirPath = path.join(projectPath, "e2e", "logs");
  await fs.mkdir(logsDirPath, { recursive: true });
  const xmlOut = path.join(logsDirPath, `.raw-pytest-${runId}.xml`);

  const args = ["-m", "pytest", ...files, "--base-url", baseURL, "-o", "junit_family=xunit2", "--junitxml", xmlOut];
  if (headed) args.push("--headed");

  emit(`\n=== pytest ===`);
  emit(`$ python ${args.join(" ")}`);
  emit(`baseURL=${baseURL} headed=${headed}`);

  const exitCode = await runProcess("python", args, {
    cwd: projectPath,
    emit,
    signal,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  try {
    const xml = await fs.readFile(xmlOut, "utf8");
    const results = normalizePytest(xml, projectPath);
    await fs.unlink(xmlOut).catch(() => {});
    return results;
  } catch {
    emit(`could not read pytest JUnit report (exit ${exitCode})`);
    return [];
  }
}

// --- top-level orchestration -------------------------------------------------

export async function runTests(opts: RunOptions): Promise<RunLog> {
  const { projectPath, selection, headed, baseURL, workers, retries, onLine, signal } = opts;
  const runId = nowRunId();
  const startedAt = new Date().toISOString();
  const logsDirPath = path.join(projectPath, "e2e", "logs");
  await fs.mkdir(logsDirPath, { recursive: true });

  const emit = (l: string) => onLine?.(stripAnsi(l).replace(/\r$/, ""));

  // A selected test's file can vanish between the client's test list load and
  // this run (deleted on disk, moved, etc). Passing a missing path straight to
  // the runner just produces a generic "no tests found" - check first so each
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

  // Route each file to the runner that owns its extension. When selection is
  // empty ("run all"), preserve the original behavior of always invoking
  // Playwright with no path args (it runs everything under testDir), and only
  // additionally invoke pytest if the project actually has any pytest tests.
  let tsFiles: string[];
  let pyFiles: string[];
  let runTs: boolean;
  let runPy: boolean;
  if (selection.length === 0) {
    tsFiles = [];
    pyFiles = [];
    runTs = true;
    runPy = (await listTests(projectPath)).some((t) => t.runtime === "pytest");
  } else {
    tsFiles = existingSelection.filter((f) => !f.toLowerCase().endsWith(".py"));
    pyFiles = existingSelection.filter((f) => f.toLowerCase().endsWith(".py"));
    runTs = tsFiles.length > 0;
    runPy = pyFiles.length > 0;
  }

  let tests: RunTestResult[] = [];
  if (runTs) {
    tests = tests.concat(await runPlaywright(tsFiles, { projectPath, headed, baseURL, workers, retries, emit, signal }));
  }
  if (runPy) {
    tests = tests.concat(await runPytest(pyFiles, { projectPath, headed, baseURL, emit, signal }));
  }
  tests = [...tests, ...missingResults];

  const finishedAt = new Date().toISOString();
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
