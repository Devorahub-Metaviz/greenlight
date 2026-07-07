// Per-project base URL presets from orchestrator.json.
import { promises as fs } from "fs";
import path from "path";
import type { UrlPresets } from "./types";

const DEFAULT_PRESETS: UrlPresets = {
  presets: { local: "http://localhost:3000" },
  default: "local",
};

export async function readPresets(projectPath: string): Promise<UrlPresets> {
  try {
    const raw = await fs.readFile(path.join(projectPath, "orchestrator.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.presets === "object") {
      return {
        presets: parsed.presets,
        default: typeof parsed.default === "string" ? parsed.default : Object.keys(parsed.presets)[0] ?? "local",
      };
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_PRESETS;
}

export function resolveBaseUrl(presets: UrlPresets, presetKey?: string): string {
  const key = presetKey && presets.presets[presetKey] ? presetKey : presets.default;
  return presets.presets[key] ?? Object.values(presets.presets)[0] ?? "http://localhost:3000";
}
