// Enumerate E2E test cases for a project by walking the e2e/ folder.
// Convention: e2e/<module>/<id>.spec.ts  (module = first segment, id = file basename)
import { promises as fs } from "fs";
import path from "path";
import type { ModuleGroup, TestCase } from "./types";

const SPEC_RE = /\.spec\.(ts|tsx|js|jsx|mjs)$/;
const IGNORE_DIRS = new Set(["logs", "docs", "node_modules", "test-results", "playwright-report"]);

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
    } else if (SPEC_RE.test(entry.name)) {
      const relFromE2e = path.relative(e2eRoot, full).split(path.sep).join("/");
      const segments = relFromE2e.split("/");
      // e2e/<module>/<id>.spec.ts  OR  e2e/<module>/<feature>/<id>.spec.ts
      const module = segments.length > 1 ? segments[0] : "(root)";
      const feature = segments.length > 2 ? segments[1] : undefined;
      const id = entry.name.replace(SPEC_RE, "");
      out.push({
        id,
        module,
        feature,
        file: `e2e/${relFromE2e}`,
      });
    }
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
