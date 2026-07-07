// Client-side fetch helpers.
"use client";
import type { ChecklistItem, ModuleGroup, Project, RunLog, SqaFile, TestHistory, UrlPresets } from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function getConfig() {
  return j<{ projectsRoot: string | null }>(await fetch("/api/config"));
}

export async function setProjectsRoot(projectsRoot: string) {
  return j<{ projectsRoot: string }>(
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectsRoot }),
    })
  );
}

export async function getProjects() {
  return j<{ projectsRoot: string | null; projects: Project[] }>(await fetch("/api/projects"));
}

export async function getTests(projectId: string) {
  return j<{ modules: ModuleGroup[]; history: Record<string, TestHistory> }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/tests`)
  );
}

export async function getSqa(projectId: string) {
  return j<{ sqa: SqaFile }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/sqa`));
}

export async function sqaAction(projectId: string, payload: Record<string, unknown>) {
  return j<{ sqa: SqaFile }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/sqa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function importSqa(projectId: string, payload: Record<string, unknown>) {
  return sqaAction(projectId, { action: "import", ...payload });
}

export async function getPresets(projectId: string) {
  return j<{ presets: UrlPresets }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/presets`));
}

export async function getLogs(projectId: string) {
  return j<{ runs: RunLog[] }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/logs`));
}

// ---- GitHub ----
export interface GitHubStatus { hasClientId: boolean; authenticated: boolean; login: string | null }
export interface GitHubDevice { device_code: string; user_code: string; verification_uri: string; verification_uri_complete?: string; interval: number; expires_in: number }
export interface Repo { full_name: string; name: string; owner: string }
export interface Board { id: string; title: string; number: number }
export interface Connection { owner: string; repo: string; boardId?: string; boardTitle?: string; boardNumber?: number }
export interface IssueRecord { number: number; url: string; createdAt: string; onBoard: boolean }

export async function githubStatus() {
  return j<GitHubStatus>(await fetch("/api/github"));
}
async function githubPost<T>(payload: Record<string, unknown>) {
  return j<T>(await fetch("/api/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}
export const githubSetClientId = (clientId: string) => githubPost<GitHubStatus>({ action: "setClientId", clientId });
export const githubStartDevice = () => githubPost<GitHubDevice>({ action: "startDevice" });
export const githubPollDevice = (device_code: string) => githubPost<{ status: "authorized" | "pending" | "slow_down"; login?: string }>({ action: "pollDevice", device_code });
export const githubLogout = () => githubPost<GitHubStatus>({ action: "logout" });

export async function githubRepos() {
  return j<{ repos: Repo[] }>(await fetch("/api/github/repos"));
}
export async function githubBoards(owner: string) {
  return j<{ boards: Board[] }>(await fetch(`/api/github/projects?owner=${encodeURIComponent(owner)}`));
}
export async function getConnection(projectId: string) {
  return j<{ connection: Connection | null }>(await fetch(`/api/github/connections?projectId=${encodeURIComponent(projectId)}`));
}
export async function saveConnection(payload: Record<string, unknown>) {
  return j<{ connection: Connection | null }>(await fetch("/api/github/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}
export async function getIssues(projectId: string) {
  return j<{ issues: Record<string, IssueRecord> }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/issues`));
}
export async function createIssues(projectId: string, failures: Record<string, unknown>[], addToBoard: boolean) {
  return j<{ created: { testId: string; number: number; url: string; onBoard: boolean }[]; errors: { testId: string; error: string }[]; issues: Record<string, IssueRecord> }>(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ failures, addToBoard }) })
  );
}

export interface AppSettings { defaultHeaded: boolean; autoOpenFailPanel: boolean; workers: number | null; retries: number | null }
export async function getSettings() {
  return j<{ settings: AppSettings }>(await fetch("/api/settings"));
}
export async function saveSettings(patch: Partial<AppSettings>) {
  return j<{ settings: AppSettings }>(await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
}

export interface Site { id: string; name: string; prod: string; staging?: string; project?: string }

export async function getWebsites() {
  return j<{ sites: Site[] }>(await fetch("/api/websites"));
}

export async function websiteAction(payload: Record<string, unknown>) {
  return j<{ sites: Site[] }>(
    await fetch("/api/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

// Run tests via SSE. Calls onLine per log line, resolves with the final RunLog.
export async function runTests(
  projectId: string,
  opts: { selection: string[]; headed: boolean; baseURL?: string; preset?: string },
  onLine: (line: string) => void
): Promise<RunLog | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok || !res.body) throw new Error(`Run failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finalLog: RunLog | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const evMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (!evMatch || !dataMatch) continue;
      const event = evMatch[1];
      const data = JSON.parse(dataMatch[1]);
      if (event === "log") onLine(data.line as string);
      else if (event === "done") finalLog = data as RunLog;
      else if (event === "error") throw new Error(data.message);
    }
  }
  return finalLog;
}

export type { ChecklistItem };
