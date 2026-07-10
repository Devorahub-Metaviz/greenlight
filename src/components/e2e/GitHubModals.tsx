"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, GitBranch, Loader2, Search, X } from "lucide-react";
import {
  githubStartDevice, githubPollDevice, githubSetClientId,
  githubRepos, githubBoards, saveConnection, createIssues,
  type GitHubStatus, type Board, type Connection, type IssueRecord, type Repo,
} from "@/lib/client";
import type { RunLog } from "@/lib/e2e-mock";
import { cn } from "@/lib/utils";

// Tauri's webview doesn't hand target="_blank" off to the system browser -
// it needs the shell plugin's open() call explicitly. No-op fallback (plain
// <a> behavior) outside the Tauri shell, e.g. `next dev` in a real browser.
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
async function openExternal(e: React.MouseEvent, url: string) {
  if (!inTauri()) return;
  e.preventDefault();
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(url);
}

const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm";
const panel = "w-full rounded-2xl border border-border bg-card p-5 shadow-elevated";
const input = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
const btnPrimary = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-50";
const btnGhost = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:border-primary/50";

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <GitBranch className="h-5 w-5 text-primary" />
      <h3 className="text-base font-semibold">{title}</h3>
      <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ---- Login (Device Flow) ----
export function GitHubLoginModal({ hasClientId, onClose, onAuthed }: { hasClientId: boolean; onClose: () => void; onAuthed: (login: string) => void }) {
  const [step, setStep] = useState<"clientId" | "device" | "done">(hasClientId ? "device" : "clientId");
  const [doneLogin, setDoneLogin] = useState("");
  const [clientId, setClientId] = useState("");
  const [device, setDevice] = useState<{ user_code: string; verification_uri: string; verification_uri_complete?: string; device_code: string; interval: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const onAuthedRef = useRef(onAuthed);
  onAuthedRef.current = onAuthed;

  async function begin() {
    setBusy(true); setError(null);
    try {
      const d = await githubStartDevice();
      setDevice(d); setStep("device");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveId() {
    if (!clientId.trim()) { setError("Client ID required"); return; }
    setBusy(true); setError(null);
    try { await githubSetClientId(clientId.trim()); await begin(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  useEffect(() => { if (step === "device" && hasClientId && !device) begin(); /* eslint-disable-next-line */ }, []);

  // poll for authorization (independent of onAuthed identity; backs off on slow_down)
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let interval = Math.max(3, device.interval);
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (cancelled) return;
      try {
        const r = await githubPollDevice(device.device_code);
        if (cancelled) return;
        if (r.status === "authorized") { setDoneLogin(r.login || "github"); setStep("done"); setTimeout(() => onAuthedRef.current(r.login || "github"), 1800); return; }
        if (r.status === "slow_down") interval += 5;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
        return;
      }
      timer = setTimeout(loop, interval * 1000);
    };
    timer = setTimeout(loop, interval * 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [device?.device_code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={overlay} onClick={onClose}>
      <div className={cn(panel, "max-w-md")} onClick={(e) => e.stopPropagation()}>
        <Header title="Connect GitHub" onClose={onClose} />
        {step === "done" ? (
          <div className="flex flex-col items-center py-5 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-white shadow-elevated">
              <Check className="h-8 w-8" strokeWidth={3} />
            </div>
            <div className="text-lg font-semibold text-foreground">You&apos;re all set! 🎉</div>
            <div className="mt-1 text-sm text-muted-foreground">Connected as <span className="font-mono text-foreground">@{doneLogin}</span></div>
            <div className="mt-1 text-xs text-muted-foreground">You can now file issues for failing tests.</div>
          </div>
        ) : step === "clientId" ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Paste your GitHub OAuth App <b>Client ID</b>. When creating the app, tick <b>Enable Device Flow</b>.</p>
            <a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer" onClick={(e) => openExternal(e, "https://github.com/settings/applications/new")} className={cn(btnGhost, "mb-3 w-full justify-center")}>
              <ExternalLink className="h-4 w-4" /> Create a GitHub OAuth App
            </a>
            <p className="mb-2 text-xs text-muted-foreground">Or paste an existing app&apos;s <b>Client ID</b> from <span className="font-mono">github.com/settings/developers</span>.</p>
            <input className={cn(input, "font-mono")} placeholder="Iv1.xxxxxxxxxxxx" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Callback URL can be anything (e.g. <span className="font-mono">http://localhost</span>); Device Flow doesn&apos;t use it.</p>
            {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
            <div className="mt-4 flex justify-end"><button className={btnPrimary} disabled={busy} onClick={saveId}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue</button></div>
          </>
        ) : (
          <>
            {!device ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Starting…</div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">1. Open GitHub and confirm this code:</p>
                <div className="my-3 flex items-center gap-2 rounded-xl border border-border bg-surface py-3 pl-4 pr-2">
                  <span className="flex-1 text-center font-mono text-2xl font-bold tracking-[0.3em] text-foreground">{device.user_code}</span>
                  <button onClick={() => { navigator.clipboard.writeText(device.user_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); }}
                    title="Copy code" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground hover:border-primary/50">
                    {codeCopied ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <a href={device.verification_uri_complete || device.verification_uri} target="_blank" rel="noreferrer" onClick={(e) => openExternal(e, device.verification_uri_complete || device.verification_uri)} className={cn(btnPrimary, "w-full")}>
                  <ExternalLink className="h-4 w-4" /> Open GitHub authorization page
                </a>
                <div className="mt-2 flex items-center justify-between">
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{device.verification_uri_complete || device.verification_uri}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> waiting…</span>
                </div>
              </>
            )}
            {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Connect repo + board ----
export function ConnectRepoModal({ projectId, current, onClose, onSaved }: { projectId: string; current: Connection | null; onClose: () => void; onSaved: (c: Connection) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState<Repo | null>(current ? { full_name: `${current.owner}/${current.repo}`, name: current.repo, owner: current.owner } : null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [boardId, setBoardId] = useState<string>(current?.boardId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { githubRepos().then((r) => setRepos(r.repos)).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!repo) { setBoards(null); return; }
    setBoards(null);
    githubBoards(repo.owner).then((r) => setBoards(r.boards)).catch(() => setBoards([]));
  }, [repo]);

  const filtered = useMemo(() => (repos ?? []).filter((r) => r.full_name.toLowerCase().includes(query.toLowerCase())).slice(0, 40), [repos, query]);

  async function save() {
    if (!repo) { setError("Pick a repository"); return; }
    setBusy(true); setError(null);
    try {
      const board = boards?.find((b) => b.id === boardId);
      const r = await saveConnection({ projectId, owner: repo.owner, repo: repo.name, boardId: boardId || undefined, boardTitle: board?.title, boardNumber: board?.number });
      if (r.connection) onSaved(r.connection);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div className={cn(panel, "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <Header title="Connect repository & board" onClose={onClose} />
        <p className="mb-3 text-xs text-muted-foreground">Issues for failing tests in <span className="font-mono text-foreground">{projectId}</span> will be created here.</p>

        {/* repo picker */}
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(input, "pl-9")} placeholder={repo ? repo.full_name : "Search repositories…"} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="mb-4 max-h-40 overflow-y-auto scrollbar-thin rounded-lg border border-border">
          {!repos && <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> loading repos…</div>}
          {repos && filtered.map((r) => (
            <button key={r.full_name} onClick={() => { setRepo(r); setQuery(""); }}
              className={cn("flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted", repo?.full_name === r.full_name && "bg-accent/60")}>
              <span className="font-mono text-[13px]">{r.full_name}</span>
              {repo?.full_name === r.full_name && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>

        {/* board picker */}
        {repo && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projects board (optional)</label>
            {!boards ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> loading boards…</div>
            ) : (
              <select className={input} value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                <option value="">No board (repo issue only)</option>
                {boards.map((b) => <option key={b.id} value={b.id}>#{b.number} · {b.title}</option>)}
              </select>
            )}
          </div>
        )}

        {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !repo} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save connection</button>
        </div>
      </div>
    </div>
  );
}

// ---- Failures -> issues ----
export function FailuresModal({ projectId, log, connection, existing, onClose, onConnect, onCreated }: {
  projectId: string; log: RunLog; connection: Connection | null; existing: Record<string, IssueRecord>;
  onClose: () => void; onConnect: () => void; onCreated: (issues: Record<string, IssueRecord>) => void;
}) {
  const failures = useMemo(() => log.tests.filter((t) => t.status === "failed"), [log]);
  // A test that fails again in a run after its issue was filed is a fresh
  // occurrence (could be a regression, could be the same bug never fixed) -
  // either way it's worth re-filing, so don't treat the old issue as blocking.
  const [selected, setSelected] = useState<Set<string>>(
    new Set(failures.filter((f) => !existing[f.id] || new Date(existing[f.id].createdAt).getTime() < log.finishedAt).map((f) => f.id))
  );
  const [addToBoard, setAddToBoard] = useState(!!connection?.boardId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState(existing);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function create() {
    if (!connection) { onConnect(); return; }
    const picks = failures.filter((f) => selected.has(f.id)).map((f) => ({ testId: f.id, file: f.file, error: f.error, baseURL: log.baseURL, runId: log.runId }));
    if (!picks.length) return;
    setBusy(true); setError(null);
    try {
      const r = await createIssues(projectId, picks, addToBoard);
      setIssues(r.issues);
      onCreated(r.issues);
      setSelected(new Set());
      if (r.errors.length) setError(`${r.errors.length} failed: ${r.errors[0].error}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className={overlay} onClick={onClose}>
      <div className={cn(panel, "max-w-xl")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive" style={{ background: "color-mix(in oklab, var(--color-destructive) 14%, transparent)" }}>{failures.length}</span>
          <h3 className="text-base font-semibold">{failures.length} test{failures.length === 1 ? "" : "s"} failed</h3>
          <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {!connection ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="text-muted-foreground">No GitHub repo connected for <span className="font-mono text-foreground">{projectId}</span>. Connect one to file issues.</p>
            <button className={cn(btnPrimary, "mt-3")} onClick={onConnect}><GitBranch className="h-4 w-4" /> Connect repo & board</button>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Choose which failures become GitHub issues in <span className="font-mono text-foreground">{connection.owner}/{connection.repo}</span>{connection.boardTitle ? <> · board <span className="font-mono">#{connection.boardNumber}</span></> : null}.</p>
            <div className="mb-3 max-h-64 overflow-y-auto scrollbar-thin rounded-xl border border-border">
              {failures.map((f) => {
                const rec = issues[f.id];
                const stale = !rec || new Date(rec.createdAt).getTime() < log.finishedAt;
                return (
                  <label key={f.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
                    <input type="checkbox" disabled={!!rec && !stale} checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
                    <span className="font-mono text-[13px] font-medium text-primary">{f.id}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{f.file}</span>
                    {rec ? (
                      <a href={rec.url} target="_blank" rel="noreferrer" onClick={(e) => openExternal(e, rec.url)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-success)] hover:underline">#{rec.number} <ExternalLink className="h-3 w-3" /></a>
                    ) : <span className="ml-auto text-[11px] text-muted-foreground">new</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" disabled={!connection.boardId} checked={addToBoard} onChange={(e) => setAddToBoard(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
                add to board{!connection.boardId && " (none connected)"}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <button className={btnGhost} onClick={onClose}>Close</button>
                <button className={btnPrimary} disabled={busy || selected.size === 0} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />} Create issue{selected.size === 1 ? "" : "s"}</button>
              </div>
            </div>
            {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
