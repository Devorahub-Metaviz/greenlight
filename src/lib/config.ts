// App-level config: where the user's projects root folder lives.
// Persisted at <appRoot>/.orchestrator/config.json (gitignored).
import { promises as fs } from "fs";
import path from "path";
import { appDataRoot } from "./appDir";

export interface AppConfig {
  projectsRoot: string | null;
}

const CONFIG_DIR = path.join(appDataRoot(), ".orchestrator");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { projectsRoot: typeof parsed.projectsRoot === "string" ? parsed.projectsRoot : null };
  } catch {
    return { projectsRoot: null };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

// Validate that a path exists and is a directory. Throws on invalid.
export async function assertDir(p: string): Promise<void> {
  const stat = await fs.stat(p);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${p}`);
}
