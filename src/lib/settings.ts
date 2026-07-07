// App-wide settings, stored at .orchestrator/settings.json.
import { promises as fs } from "fs";
import path from "path";
import { appDataRoot } from "./appDir";

export interface Settings {
  defaultHeaded: boolean;
  autoOpenFailPanel: boolean;
  workers: number | null;
  retries: number | null;
}

const DEFAULTS: Settings = {
  defaultHeaded: false,
  autoOpenFailPanel: true,
  workers: null,
  retries: null,
};

const FILE = path.join(appDataRoot(), ".orchestrator", "settings.json");

export async function readSettings(): Promise<Settings> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8"));
    return {
      defaultHeaded: !!raw.defaultHeaded,
      autoOpenFailPanel: raw.autoOpenFailPanel !== false,
      workers: typeof raw.workers === "number" ? raw.workers : null,
      retries: typeof raw.retries === "number" ? raw.retries : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const next = { ...current, ...patch };
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
