// Global websites/domains registry, stored at <projectsRoot>/websites.json.
// Each site has a prod domain and an optional staging domain; these feed the
// base-URL dropdown used when running tests.
import { promises as fs } from "fs";
import path from "path";
import { readConfig } from "./config";

export interface Site {
  id: string;
  name: string;
  prod: string;
  staging?: string;
  project?: string; // linked app-project id (a subfolder under the projects root)
}

export interface WebsitesFile {
  sites: Site[];
}

async function websitesPath(): Promise<string | null> {
  const { projectsRoot } = await readConfig();
  if (!projectsRoot) return null;
  return path.join(projectsRoot, "websites.json");
}

export async function readWebsites(): Promise<WebsitesFile> {
  const file = await websitesPath();
  if (!file) return { sites: [] };
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    const sites: Site[] = Array.isArray(parsed.sites)
      ? parsed.sites
          .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === "object")
          .map((s: Record<string, unknown>) => ({
            id: String(s.id ?? s.name ?? "").trim(),
            name: String(s.name ?? s.id ?? "").trim(),
            prod: String(s.prod ?? "").trim(),
            staging: s.staging ? String(s.staging).trim() : undefined,
            project: s.project ? String(s.project).trim() : undefined,
          }))
          .filter((s: Site) => s.id && s.prod)
      : [];
    return { sites };
  } catch {
    return { sites: [] };
  }
}

async function writeWebsites(data: WebsitesFile): Promise<void> {
  const file = await websitesPath();
  if (!file) throw new Error("Projects root not set");
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function addSite(site: Site): Promise<WebsitesFile> {
  const data = await readWebsites();
  if (data.sites.some((s) => s.id === site.id)) {
    throw new Error(`Site "${site.id}" already exists`);
  }
  data.sites.push(site);
  await writeWebsites(data);
  return data;
}

export async function updateSite(id: string, patch: Partial<Site>): Promise<WebsitesFile> {
  const data = await readWebsites();
  const idx = data.sites.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Site "${id}" not found`);
  data.sites[idx] = { ...data.sites[idx], ...patch, id }; // id stays stable
  await writeWebsites(data);
  return data;
}

export async function deleteSite(id: string): Promise<WebsitesFile> {
  const data = await readWebsites();
  data.sites = data.sites.filter((s) => s.id !== id);
  await writeWebsites(data);
  return data;
}

// Flatten sites into base-URL dropdown options (prod + staging per site).
export function siteBaseUrlOptions(data: WebsitesFile): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const s of data.sites) {
    if (s.prod) out.push({ label: `${s.name} · prod`, value: s.prod });
    if (s.staging) out.push({ label: `${s.name} · staging`, value: s.staging });
  }
  return out;
}
