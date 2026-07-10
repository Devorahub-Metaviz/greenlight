// Read/validate/write sqa.json (SQA checklist) + starter spec creation.
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { ChecklistItem, SqaFile } from "./types";

const prioritySchema = z.enum(["high", "medium", "low"]);
const statusSchema = z.enum(["open", "in-progress", "done", "blocked"]);

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  module: z.string().min(1),
  feature: z.string().optional(),
  tests: z.array(z.string()).default([]),
  priority: prioritySchema.default("medium"),
  status: statusSchema.default("open"),
});

const sqaSchema = z.object({
  project: z.string().default(""),
  checklist: z.array(itemSchema).default([]),
  modules: z.record(z.string(), z.string()).default({}),
});

function sqaPath(projectPath: string): string {
  return path.join(projectPath, "sqa.json");
}

export async function readSqa(projectPath: string, projectName: string): Promise<SqaFile> {
  let raw: string;
  try {
    raw = await fs.readFile(sqaPath(projectPath), "utf8");
  } catch {
    return { project: projectName, checklist: [] }; // no sqa.json yet - normal for a new project
  }
  try {
    return sqaSchema.parse(JSON.parse(raw)) as SqaFile;
  } catch (err) {
    // A malformed/invalid sqa.json silently produced an empty checklist before,
    // which looked identical to "no tests exist" - log it so this is diagnosable.
    console.error(`sqa.json at ${sqaPath(projectPath)} failed validation, showing an empty checklist:`, err);
    return { project: projectName, checklist: [] };
  }
}

// Atomic write with a one-shot backup of the previous file.
export async function writeSqa(projectPath: string, sqa: SqaFile): Promise<void> {
  const validated = sqaSchema.parse(sqa);
  const file = sqaPath(projectPath);
  try {
    const prev = await fs.readFile(file, "utf8");
    await fs.writeFile(file + ".bak", prev, "utf8");
  } catch {
    // no previous file, nothing to back up
  }
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(validated, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function starterSpecTs(item: ChecklistItem): string {
  return `import { test, expect } from "@playwright/test";

// ${item.id} - ${item.title}
test(${JSON.stringify(item.title || item.id)}, async ({ page }) => {
  await page.goto("/");
  // TODO: implement checks for ${item.id}
  await expect(page).toHaveURL(/./);
});
`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "test";
}

function starterSpecPy(item: ChecklistItem, funcName: string): string {
  return `"""${item.id} - ${item.title}"""
from playwright.sync_api import expect


def ${funcName}(page):
    page.goto("/")
    # TODO: implement checks for ${item.id}
    expect(page).to_have_url(page.url)
`;
}

// A project is Python/pytest-based if it has a pytest.ini (vs a TS/Playwright
// project's playwright.config.ts). Falls back to TS for a brand-new project.
async function isPytestProject(projectPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, "pytest.ini"));
    return true;
  } catch {
    return false;
  }
}

// Create a starter test file if it does not exist. Returns its relative path.
export async function createStarterSpec(projectPath: string, item: ChecklistItem): Promise<string> {
  const dir = item.feature ? `${item.module}/${item.feature}` : item.module;

  if (await isPytestProject(projectPath)) {
    const num = item.id.match(/(\d+)/)?.[1];
    const base = num ? `tc${num}_${slugify(item.title || item.id)}` : `tc_${slugify(item.id)}_${slugify(item.title)}`;
    const rel = `e2e/${dir}/${base}.py`;
    const abs = path.join(projectPath, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    try {
      await fs.access(abs); // already exists, leave it alone
    } catch {
      await fs.writeFile(abs, starterSpecPy(item, `test_${base}`), "utf8");
    }
    return rel;
  }

  const rel = `e2e/${dir}/${item.id}.spec.ts`;
  const abs = path.join(projectPath, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  try {
    await fs.access(abs); // already exists, leave it alone
  } catch {
    await fs.writeFile(abs, starterSpecTs(item), "utf8");
  }
  return rel;
}
