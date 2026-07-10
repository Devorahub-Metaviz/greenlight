// Enumerate E2E test cases for a project by walking the e2e/ folder.
// Two conventions are supported side by side:
//   Playwright/TS: e2e/<module>/<id>.spec.ts        (module = first segment, id = file basename)
//   pytest/Python: e2e/<Module>/tc<n>_<slug>.py      (matches pytest.ini's `python_files = tc*.py`;
//                  leading-underscore files and config.py are page-object/helper modules, never tests)
import { promises as fs } from "fs";
import path from "path";
import type { ModuleGroup, TestCase } from "./types";

const TS_SPEC_RE = /\.spec\.(ts|tsx|js|jsx|mjs)$/;
const PY_SPEC_RE = /^tc.*\.py$/i;
const IGNORE_DIRS = new Set(["logs", "docs", "node_modules", "test-results", "playwright-report", "__pycache__", ".pytest_cache"]);

async function walk(dir: string, e2eRoot: string, out: TestCase[]): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, e2eRoot, out);
      continue;
    }
    const isTs = TS_SPEC_RE.test(entry.name);
    const isPy = PY_SPEC_RE.test(entry.name);
    if (!isTs && !isPy) continue;

    const relFromE2e = path.relative(e2eRoot, full).split(path.sep).join("/");
    const segments = relFromE2e.split("/");
    // e2e/<module>/<id>.ext  OR  e2e/<module>/<feature>/<id>.ext
    const module = segments.length > 1 ? segments[0] : "(root)";
    const feature = segments.length > 2 ? segments[1] : undefined;
    const id = isTs ? entry.name.replace(TS_SPEC_RE, "") : entry.name.replace(/\.py$/i, "");
    out.push({
      id,
      module,
      feature,
      file: `e2e/${relFromE2e}`,
      runtime: isTs ? "playwright" : "pytest",
    });
  }
}

export async function listTests(projectPath: string): Promise<TestCase[]> {
  const e2eRoot = path.join(projectPath, "e2e");
  const out: TestCase[] = [];
  await walk(e2eRoot, e2eRoot, out);
  out.sort((a, b) => a.module.localeCompare(b.module) || a.id.localeCompare(b.id));
  return out;
}

// Group tests by module for the explorer tree.
export async function listModuleGroups(projectPath: string): Promise<ModuleGroup[]> {
  const tests = await listTests(projectPath);
  const map = new Map<string, TestCase[]>();
  for (const t of tests) {
    if (!map.has(t.module)) map.set(t.module, []);
    map.get(t.module)!.push(t);
  }
  return [...map.entries()]
    .map(([module, tests]) => ({ module, tests }))
    .sort((a, b) => a.module.localeCompare(b.module));
}
