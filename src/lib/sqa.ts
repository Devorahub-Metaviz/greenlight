// Read/validate/write sqa.json (SQA checklist) + starter spec creation.
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { ChecklistItem, SqaFile } from "./types";

const prioritySchema = z.enum(["high", "medium", "low"]);
const statusSchema = z.enum(["open", "in-progress", "done"]);

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
  try {
    const raw = await fs.readFile(sqaPath(projectPath), "utf8");
    const parsed = sqaSchema.parse(JSON.parse(raw));
    return parsed as SqaFile;
  } catch {
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

function starterSpec(item: ChecklistItem): string {
  return `import { test, expect } from "@playwright/test";

// ${item.id} - ${item.title}
test(${JSON.stringify(item.title || item.id)}, async ({ page }) => {
  await page.goto("/");
  // TODO: implement checks for ${item.id}
  await expect(page).toHaveURL(/./);
});
`;
}

// Create a starter spec file if it does not exist. Returns its relative path.
export async function createStarterSpec(projectPath: string, item: ChecklistItem): Promise<string> {
  const rel = item.feature
    ? `e2e/${item.module}/${item.feature}/${item.id}.spec.ts`
    : `e2e/${item.module}/${item.id}.spec.ts`;
  const abs = path.join(projectPath, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  try {
    await fs.access(abs); // already exists, leave it alone
  } catch {
    await fs.writeFile(abs, starterSpec(item), "utf8");
  }
  return rel;
}
