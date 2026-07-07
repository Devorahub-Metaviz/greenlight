// Scan the projects-root folder and resolve individual projects.
import { promises as fs } from "fs";
import path from "path";
import type { Project } from "./types";
import { readConfig } from "./config";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// A subfolder counts as a project if it contains an `e2e/` directory.
export async function scanProjects(root: string): Promise<Project[]> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects: Project[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const projectPath = path.join(root, entry.name);
    const e2ePath = path.join(projectPath, "e2e");
    const hasE2e = await exists(e2ePath);
    if (!hasE2e) continue;

    const hasSqa = await exists(path.join(projectPath, "sqa.json"));
    projects.push({
      id: entry.name,
      name: entry.name,
      path: projectPath,
      hasE2e,
      hasSqa,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

// Resolve a single project by its id (folder name) under the configured root.
export async function resolveProject(projectId: string): Promise<Project | null> {
  const { projectsRoot } = await readConfig();
  if (!projectsRoot) return null;
  const projects = await scanProjects(projectsRoot);
  return projects.find((p) => p.id === projectId) ?? null;
}
