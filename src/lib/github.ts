// GitHub integration: Device Flow OAuth + issue creation + Projects v2 board cards.
// Token, client id, and per-project board connections are stored under .orchestrator/.
import { promises as fs } from "fs";
import path from "path";
import { appDataRoot } from "./appDir";

const DIR = path.join(appDataRoot(), ".orchestrator");
const AUTH_FILE = path.join(DIR, "github.json");
const CONN_FILE = path.join(DIR, "connections.json");

interface AuthStore {
  clientId?: string;
  token?: string;
  login?: string;
}

export interface Connection {
  owner: string;
  repo: string;          // "owner/name" -> we store repo name + owner separately
  boardId?: string;      // Projects v2 node id
  boardTitle?: string;
  boardNumber?: number;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function readAuth(): Promise<AuthStore> {
  return readJson<AuthStore>(AUTH_FILE, {});
}
async function writeAuth(a: AuthStore): Promise<void> {
  await writeJson(AUTH_FILE, a);
}

export async function getClientId(): Promise<string | null> {
  if (process.env.GITHUB_CLIENT_ID) return process.env.GITHUB_CLIENT_ID;
  const a = await readAuth();
  return a.clientId ?? null;
}
export async function setClientId(clientId: string): Promise<void> {
  const a = await readAuth();
  a.clientId = clientId.trim();
  await writeAuth(a);
}

export async function getToken(): Promise<string | null> {
  const a = await readAuth();
  return a.token ?? null;
}

export async function getStatus(): Promise<{ hasClientId: boolean; authenticated: boolean; login: string | null }> {
  const [clientId, a] = await Promise.all([getClientId(), readAuth()]);
  return { hasClientId: !!clientId, authenticated: !!a.token, login: a.login ?? null };
}

export async function logout(): Promise<void> {
  const a = await readAuth();
  await writeAuth({ clientId: a.clientId }); // keep clientId, drop token/login
}

// read:org lets us enumerate the user's organizations (and thus their repos).
const SCOPES = "repo project read:org";

// ---- Device Flow ----
export async function startDeviceFlow(): Promise<{
  device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number;
}> {
  const clientId = await getClientId();
  if (!clientId) throw new Error("GitHub Client ID not set");
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: SCOPES }),
  });
  const data = await res.json();
  if (!data.device_code) throw new Error(data.error_description || "Failed to start device flow");
  return data;
}

// Poll once. Returns 'authorized' (and persists token), 'pending', 'slow_down', or throws on fatal error.
export async function pollDeviceToken(deviceCode: string): Promise<{ status: "authorized" | "pending" | "slow_down"; login?: string }> {
  const clientId = await getClientId();
  if (!clientId) throw new Error("GitHub Client ID not set");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  });
  const data = await res.json();
  if (data.access_token) {
    const viewer = await getViewer(data.access_token);
    await writeAuth({ clientId, token: data.access_token, login: viewer.login });
    return { status: "authorized", login: viewer.login };
  }
  if (data.error === "authorization_pending") return { status: "pending" };
  if (data.error === "slow_down") return { status: "slow_down" };
  throw new Error(data.error_description || data.error || "Authorization failed");
}

// ---- REST / GraphQL helpers ----
async function gh(pathname: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated with GitHub");
  return fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated with GitHub");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.data as T;
}

export async function getViewer(token: string): Promise<{ login: string; avatar_url: string }> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json();
}

export interface Repo { full_name: string; name: string; owner: string }

type GhRepo = { full_name: string; name: string; owner: { login: string } };

export async function listRepos(): Promise<Repo[]> {
  const out: Repo[] = [];
  const push = (batch: GhRepo[]) => { for (const r of batch) out.push({ full_name: r.full_name, name: r.name, owner: r.owner.login }); };

  // 1) Everything the user owns / collaborates on / is an org member of.
  for (let page = 1; page <= 10; page++) {
    const res = await gh(`/user/repos?per_page=100&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`);
    if (!res.ok) {
      if (page === 1) throw new Error("Failed to list repos");
      break;
    }
    const batch = (await res.json()) as GhRepo[];
    push(batch);
    if (batch.length < 100) break;
  }

  // 2) Explicitly enumerate each org's repos. /user/repos can miss org repos when the
  // org has OAuth-app access restrictions or SSO; this catches the ones it can still see.
  // (If the org blocks the OAuth app entirely, these calls fail and we skip them - the
  // org owner must approve the OAuth app for its repos to appear at all.)
  try {
    const orgsRes = await gh(`/user/orgs?per_page=100`);
    if (orgsRes.ok) {
      const orgs = (await orgsRes.json()) as { login: string }[];
      for (const org of orgs) {
        for (let page = 1; page <= 10; page++) {
          const res = await gh(`/orgs/${encodeURIComponent(org.login)}/repos?per_page=100&page=${page}&sort=full_name&type=all`);
          if (!res.ok) break;
          const batch = (await res.json()) as GhRepo[];
          push(batch);
          if (batch.length < 100) break;
        }
      }
    }
  } catch {
    // ignore org enumeration failures - fall back to whatever /user/repos returned
  }

  // de-dup + sort by full name
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.full_name) ? false : (seen.add(r.full_name), true)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export interface Board { id: string; title: string; number: number }

export async function listProjectBoards(owner: string): Promise<Board[]> {
  const data = await graphql<{
    user: { projectsV2: { nodes: Board[] } } | null;
    organization: { projectsV2: { nodes: Board[] } } | null;
  }>(
    `query($login:String!){
      user(login:$login){ projectsV2(first:50){ nodes { id title number } } }
      organization(login:$login){ projectsV2(first:50){ nodes { id title number } } }
    }`,
    { login: owner }
  );
  const nodes = [...(data.user?.projectsV2.nodes ?? []), ...(data.organization?.projectsV2.nodes ?? [])];
  return nodes;
}

export async function createIssue(owner: string, repo: string, title: string, body: string): Promise<{ number: number; html_url: string; node_id: string }> {
  const res = await gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create issue (${res.status})`);
  }
  const data = await res.json();
  return { number: data.number, html_url: data.html_url, node_id: data.node_id };
}

export async function addIssueToBoard(boardId: string, issueNodeId: string): Promise<void> {
  await graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
    `mutation($projectId:ID!,$contentId:ID!){
      addProjectV2ItemById(input:{ projectId:$projectId, contentId:$contentId }){ item { id } }
    }`,
    { projectId: boardId, contentId: issueNodeId }
  );
}

// ---- per-project connections ----
export async function readConnections(): Promise<Record<string, Connection>> {
  return readJson<Record<string, Connection>>(CONN_FILE, {});
}
export async function getConnection(projectId: string): Promise<Connection | null> {
  const all = await readConnections();
  return all[projectId] ?? null;
}
export async function setConnection(projectId: string, conn: Connection): Promise<void> {
  const all = await readConnections();
  all[projectId] = conn;
  await writeJson(CONN_FILE, all);
}
export async function deleteConnection(projectId: string): Promise<void> {
  const all = await readConnections();
  delete all[projectId];
  await writeJson(CONN_FILE, all);
}
