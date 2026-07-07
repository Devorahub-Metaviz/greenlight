"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, BookOpen, Check, ClipboardList, FlaskConical, FolderGit2, Globe, History as HistoryIcon, Leaf, Moon, Pencil, Plus, Settings, Sun, Trash2, X, Zap } from "lucide-react";
import {
  getConfig, setProjectsRoot, getProjects, getTests, getSqa, sqaAction,
  getLogs, getWebsites, websiteAction, runTests, type Site,
  githubStatus, githubLogout, getConnection, getIssues,
  getSettings, saveSettings,
  type GitHubStatus, type Connection, type IssueRecord, type AppSettings,
} from "@/lib/client";
import { GitHubLoginModal, ConnectRepoModal, FailuresModal } from "@/components/e2e/GitHubModals";
import type {
  ChecklistItem as UIChecklistItem, Project as UIProject, RunLog as UIRunLog,
  TestItem, TestStatus as UITestStatus,
} from "@/lib/e2e-mock";
import type { TestStatus as ApiTestStatus } from "@/lib/types";
import { Sidebar } from "@/components/e2e/Sidebar";
import { TestsTab, type BaseUrlOption, type ConsoleLine } from "@/components/e2e/TestsTab";
import { ChecklistTab } from "@/components/e2e/ChecklistTab";
import { HistoryTab } from "@/components/e2e/HistoryTab";
import { DocsTab } from "@/components/e2e/DocsTab";
import { AnalyticsTab } from "@/components/e2e/AnalyticsTab";
import { cn } from "@/lib/utils";

type Tab = "tests" | "checklist" | "analytics" | "history" | "docs";
const TABS: { key: Tab; label: string; Icon: typeof FlaskConical }[] = [
  { key: "tests", label: "Tests", Icon: FlaskConical },
  { key: "checklist", label: "Checklist", Icon: ClipboardList },
  { key: "analytics", label: "Analytics", Icon: BarChart3 },
  { key: "history", label: "History", Icon: HistoryIcon },
  { key: "docs", label: "Instructions", Icon: BookOpen },
];

// Full-app loading skeleton (mirrors the real layout).
function AppSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
        <span className="flex gap-1.5"><span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" /></span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-4">
          <div className="flex items-center gap-3"><div className="skeleton h-10 w-10 rounded-xl" /><div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-24" /><div className="skeleton h-2.5 w-16" /></div></div>
          <div className="mt-3 skeleton h-3 w-16" />
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 w-full rounded-lg" />)}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-9 w-24 rounded-lg" />)}
          </div>
          <div className="flex-1 space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}
          </div>
        </main>
      </div>
    </div>
  );
}

// GitHub mark (lucide dropped the brand icon)
function GhIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0024 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

// ---- adapters between API shapes and UI shapes ----
function mapStatus(s: ApiTestStatus | undefined): UITestStatus {
  if (s === "timedout") return "failed";
  if (s === "passed" || s === "failed" || s === "skipped") return s;
  return "unknown";
}
function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export default function Home() {
  const [root, setRoot] = useState<string | null | undefined>(undefined);
  const [rootInput, setRootInput] = useState("");
  const [rootError, setRootError] = useState<string | null>(null);

  const [projects, setProjects] = useState<UIProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("tests");

  const [tests, setTests] = useState<TestItem[]>([]);
  const [checklist, setChecklist] = useState<UIChecklistItem[]>([]);
  const [moduleDescriptions, setModuleDescriptions] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<UIRunLog[]>([]);
  const [baseUrls, setBaseUrls] = useState<BaseUrlOption[]>([]);
  const [websitesOpen, setWebsitesOpen] = useState(false);
  const [gh, setGh] = useState<GitHubStatus | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [issues, setIssues] = useState<Record<string, IssueRecord>>({});
  const [loginOpen, setLoginOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [failLog, setFailLog] = useState<UIRunLog | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rootModalOpen, setRootModalOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("e2e-theme", next); } catch {}
  }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  // ---- loaders ----
  const loadProjects = useCallback(async () => {
    const r = await getProjects();
    setProjects(r.projects.map((p) => ({ id: p.id, name: p.name, hasSqa: p.hasSqa })));
    setSelectedId((prev) => prev || r.projects[0]?.id || "");
  }, []);

  const loadTests = useCallback(async (id: string) => {
    const r = await getTests(id);
    const items: TestItem[] = r.modules.flatMap((m) =>
      m.tests.map((t) => {
        const h = r.history[t.file];
        return { id: t.id, module: t.module, feature: t.feature, file: t.file, lastStatus: mapStatus(h?.lastStatus), lastRunAt: isoToMs(h?.lastRunAt) };
      })
    );
    setTests(items);
  }, []);

  const loadChecklist = useCallback(async (id: string) => {
    const r = await getSqa(id);
    setChecklist(r.sqa.checklist.map((c) => ({
      id: c.id, title: c.title, module: c.module, feature: c.feature, tests: c.tests,
      priority: c.priority, status: c.status === "done" ? "done" : "todo",
    })));
    setModuleDescriptions(r.sqa.modules ?? {});
  }, []);

  const setModuleDesc = useCallback(async (module: string, description: string) => {
    setModuleDescriptions((prev) => ({ ...prev, [module]: description }));
    try { await sqaAction(selectedId, { action: "setModule", module, description }); } catch { /* ignore */ }
  }, [selectedId]);

  const loadHistory = useCallback(async (id: string) => {
    const r = await getLogs(id);
    const mapped: UIRunLog[] = r.runs.map((run) => ({
      runId: run.runId,
      finishedAt: isoToMs(run.finishedAt) ?? Date.now(),
      baseURL: run.baseURL,
      headed: run.headed,
      summary: run.summary,
      tests: run.tests.map((t) => ({ id: t.id, file: t.file, status: mapStatus(t.status), error: t.error ?? undefined })),
    }));
    // API returns newest-first; HistoryTab reverses, so hand it oldest-first.
    setRuns(mapped.reverse());
  }, []);

  const loadBaseUrls = useCallback(async (_id: string) => {
    // Only real environments: main (prod) + staging, sourced from the global websites list.
    const web = await getWebsites();
    const opts: BaseUrlOption[] = [];
    for (const s of web.sites) {
      if (s.prod) opts.push({ label: `${s.name} · main`, value: s.prod });
      if (s.staging) opts.push({ label: `${s.name} · staging`, value: s.staging });
    }
    const seen = new Set<string>();
    setBaseUrls(opts.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true))));
  }, []);

  const loadGh = useCallback(() => { githubStatus().then(setGh).catch(() => setGh(null)); }, []);
  const loadConnection = useCallback((id: string) => { getConnection(id).then((r) => setConnection(r.connection)).catch(() => setConnection(null)); }, []);
  const loadIssues = useCallback((id: string) => { getIssues(id).then((r) => setIssues(r.issues)).catch(() => setIssues({})); }, []);

  useEffect(() => {
    getConfig().then((c) => { setRoot(c.projectsRoot); if (c.projectsRoot) loadProjects(); });
    loadGh();
    getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, [loadProjects, loadGh]);

  useEffect(() => {
    if (!selectedId) return;
    loadTests(selectedId); loadChecklist(selectedId); loadHistory(selectedId); loadBaseUrls(selectedId);
    loadConnection(selectedId); loadIssues(selectedId);
  }, [selectedId, loadTests, loadChecklist, loadHistory, loadBaseUrls, loadConnection, loadIssues]);

  async function saveRoot() {
    setRootError(null);
    try {
      const r = await setProjectsRoot(rootInput.trim());
      setRoot(r.projectsRoot);
      await loadProjects();
    } catch (e) { setRootError((e as Error).message); }
  }

  async function changeRoot(path: string): Promise<string | null> {
    try {
      const r = await setProjectsRoot(path.trim());
      setRoot(r.projectsRoot);
      setSelectedId("");
      await loadProjects();
      setRootModalOpen(false);
      return null;
    } catch (e) { return (e as Error).message; }
  }

  // ---- run (real Playwright via SSE) ----
  const onRun = useCallback(
    (ids: string[], opts: { headed: boolean; baseURL: string }, onLine: (l: ConsoleLine) => void, onDone: (log: UIRunLog) => void) => {
      const idToFile = new Map(tests.map((t) => [t.id, t.file]));
      const selection = ids.map((id) => idToFile.get(id)).filter(Boolean) as string[];
      // optimistic: mark running
      setTests((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, lastStatus: "running" } : t)));

      // Parse the streaming list-reporter output to update per-test status live.
      const onRaw = (raw: string) => {
        onLine(toConsoleLine(raw));
        const fm = raw.match(/e2e[\\/][^\s:)]+\.spec\.[tj]sx?/); // Windows paths use backslashes
        if (!fm) return;
        const file = fm[0].replace(/\\/g, "/");
        let st: UITestStatus | null = null;
        if (/[✓✔√]/.test(raw)) st = "passed";
        else if (/[✘✗×]|\bfailed\b|^\s*\d+\)/.test(raw)) st = "failed";
        else if (/\bskipped\b|^\s*[-−]\s/.test(raw)) st = "skipped";
        if (st) setTests((prev) => prev.map((t) => (t.file === file ? { ...t, lastStatus: st! } : t)));
      };

      runTests(selectedId, { selection, headed: opts.headed, baseURL: opts.baseURL }, onRaw)
        .then(async (log) => {
          if (log) {
            const uiLog: UIRunLog = {
              runId: log.runId,
              finishedAt: isoToMs(log.finishedAt) ?? Date.now(),
              baseURL: log.baseURL,
              headed: log.headed,
              summary: log.summary,
              tests: log.tests.map((t) => ({ id: t.id, file: t.file, status: mapStatus(t.status), error: t.error ?? undefined })),
            };
            onDone(uiLog);
            if (settings?.autoOpenFailPanel !== false && uiLog.tests.some((t) => t.status === "failed")) setFailLog(uiLog);
          }
          await Promise.all([loadTests(selectedId), loadHistory(selectedId), loadIssues(selectedId)]);
        })
        .catch(async (e) => {
          onLine({ kind: "err", text: `ERROR: ${(e as Error).message}` });
          await loadTests(selectedId);
        });
    },
    [tests, selectedId, loadTests, loadHistory, loadIssues, settings]
  );

  // ---- checklist CRUD (diff -> API) ----
  const onChecklistChange = useCallback(
    async (next: UIChecklistItem[]) => {
      const prev = checklist;
      setChecklist(next); // optimistic
      try {
        if (next.length > prev.length) {
          const prevIds = new Set(prev.map((i) => i.id));
          const added = next.find((i) => !prevIds.has(i.id));
          if (added) await sqaAction(selectedId, { action: "add", item: { id: added.id, title: added.title, module: added.module, feature: added.feature, priority: added.priority, status: "open", tests: [] } });
          await loadTests(selectedId); // new starter spec shows up
        } else if (next.length < prev.length) {
          const nextIds = new Set(next.map((i) => i.id));
          const removed = prev.find((i) => !nextIds.has(i.id));
          if (removed) await sqaAction(selectedId, { action: "delete", id: removed.id });
        } else {
          await sqaAction(selectedId, {
            action: "save",
            checklist: next.map((i) => ({ id: i.id, title: i.title, module: i.module, feature: i.feature, tests: i.tests, priority: i.priority, status: i.status === "done" ? "done" : "open" })),
          });
        }
        await loadChecklist(selectedId);
      } catch {
        await loadChecklist(selectedId); // revert to server truth
      }
    },
    [checklist, selectedId, loadChecklist, loadTests]
  );

  // ---- render ----
  if (root === undefined) return <AppSkeleton />;

  if (!root) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-elevated">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-elevated"><Leaf className="h-5 w-5 text-white" strokeWidth={2.5} /></div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Greenlight</h1>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">e2e regression</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Choose the folder that holds your projects. Any subfolder with an <span className="font-mono text-foreground">e2e/</span> directory becomes a project.</p>
          <input
            value={rootInput}
            onChange={(e) => setRootInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveRoot()}
            placeholder="D:\path\to\projects"
            autoFocus
            className="mt-4 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          {rootError && <div className="mt-2 text-sm text-destructive">{rootError}</div>}
          <button onClick={saveRoot} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-gradient-primary text-sm font-semibold text-white shadow-elevated transition hover:opacity-95">Load projects</button>
        </div>
      </div>
    );
  }

  const project = projects.find((p) => p.id === selectedId);
  const lastRun = runs[runs.length - 1];
  const testsByProject: Record<string, TestItem[]> = selectedId ? { [selectedId]: tests } : {};
  const testDescriptions: Record<string, string> = Object.fromEntries(checklist.map((c) => [c.id, c.title]));

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Desktop-app title bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
        <span className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-primary text-white"><Zap className="h-2.5 w-2.5" /></span>
          Greenlight
        </span>
        <span className="w-12" />
      </div>
      <div className="flex min-h-0 flex-1">
      <Sidebar
        projects={projects}
        tests={testsByProject}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setTab("tests"); }}
        rootPath={root}
        onChangeRoot={() => { setRoot(null); setRootInput(root); }}
        onManageWebsites={() => setWebsitesOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
          <div className="flex items-center gap-1">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn("flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition",
                  tab === key ? "bg-accent text-accent-foreground shadow-soft" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {project && (
            <div className="ml-auto flex items-center gap-2">
              {/* GitHub connect / repo */}
              {gh?.authenticated ? (
                <button onClick={() => setConnectOpen(true)} title="Connect repo & board"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition hover:border-primary/50">
                  <GhIcon className="h-3.5 w-3.5" />
                  {connection ? <span className="font-mono">{connection.owner}/{connection.repo}</span> : <span className="text-muted-foreground">connect repo</span>}
                </button>
              ) : (
                <button onClick={() => setLoginOpen(true)} title="Connect GitHub"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#3a4149] to-[#1f2328] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.28)] ring-1 ring-white/10 transition hover:from-[#454d56] hover:to-[#24292e] hover:shadow-[0_4px_14px_rgba(0,0,0,0.32)] active:scale-[0.98]">
                  <GhIcon className="h-3.5 w-3.5" /> Connect GitHub
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-foreground">{project.name}</span>
              </span>
              <button onClick={toggleTheme} title="Toggle theme"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground hover:border-primary/50">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setSettingsOpen(true)} title="Settings"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground hover:border-primary/50">
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {!project ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">No projects with an e2e/ folder found in this root.</div>
          ) : (
            <>
              {tab === "tests" && (
                <TestsTab projectName={project.name} tests={tests} lastRun={lastRun} baseUrls={baseUrls}
                  defaultHeaded={settings?.defaultHeaded} onRun={onRun} onUpdateTestStatus={() => {}} />
              )}
              {tab === "checklist" && <ChecklistTab items={checklist} onChange={onChecklistChange} moduleDescriptions={moduleDescriptions} onSetModuleDesc={setModuleDesc} />}
              {tab === "analytics" && <AnalyticsTab tests={tests} runs={runs} />}
              {tab === "history" && <HistoryTab runs={runs} />}
              {tab === "docs" && <DocsTab projectId={selectedId} onImported={() => { loadChecklist(selectedId); loadTests(selectedId); }} />}
            </>
          )}
        </div>
      </main>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-elevated">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {websitesOpen && <WebsitesModal projects={projects} onClose={() => { setWebsitesOpen(false); if (selectedId) loadBaseUrls(selectedId); }} />}

      {failLog && selectedId && (
        <FailuresModal
          projectId={selectedId}
          log={failLog}
          connection={connection}
          existing={issues}
          onClose={() => setFailLog(null)}
          onConnect={() => { if (!gh?.authenticated) setLoginOpen(true); else setConnectOpen(true); }}
          onCreated={(iss) => setIssues(iss)}
        />
      )}
      {connectOpen && selectedId && (
        <ConnectRepoModal
          projectId={selectedId}
          current={connection}
          onClose={() => setConnectOpen(false)}
          onSaved={(c) => { setConnection(c); setConnectOpen(false); }}
        />
      )}
      {loginOpen && (
        <GitHubLoginModal
          hasClientId={!!gh?.hasClientId}
          onClose={() => setLoginOpen(false)}
          onAuthed={(login) => { setLoginOpen(false); loadGh(); showToast(`Connected to GitHub as @${login}`); }}
        />
      )}
      {rootModalOpen && <ChangeRootModal initial={root ?? ""} onClose={() => setRootModalOpen(false)} onSave={changeRoot} />}
      {settingsOpen && settings && (
        <SettingsModal
          initial={settings}
          gh={gh}
          rootPath={root ?? ""}
          onChangeRoot={() => { setSettingsOpen(false); setRootModalOpen(true); }}
          onManageWebsites={() => { setSettingsOpen(false); setWebsitesOpen(true); }}
          onConnectGitHub={() => { setSettingsOpen(false); setLoginOpen(true); }}
          onLogout={() => githubLogout().then(setGh)}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => { setSettings(s); setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}

// ---- Change projects root ----
function ChangeRootModal({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (path: string) => Promise<string | null> }) {
  const [path, setPath] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError(null);
    const err = await onSave(path);
    if (err) { setError(err); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <FolderGit2 className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Projects root</h3>
          <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Folder that holds your projects. Any subfolder with an <span className="font-mono">e2e/</span> directory becomes a project.</p>
        <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="D:\path\to\projects" autoFocus
          className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
        {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:border-primary/50">Cancel</button>
          <button onClick={submit} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-50">Load projects</button>
        </div>
      </div>
    </div>
  );
}

// ---- Settings ----
function SettingsModal({ initial, gh, rootPath, onChangeRoot, onManageWebsites, onConnectGitHub, onLogout, onClose, onSaved }: {
  initial: AppSettings; gh: GitHubStatus | null; rootPath: string; onChangeRoot: () => void; onManageWebsites: () => void;
  onConnectGitHub: () => void; onLogout: () => void;
  onClose: () => void; onSaved: (s: AppSettings) => void;
}) {
  const [s, setS] = useState<AppSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);
  const input = "h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

  async function save() {
    setBusy(true);
    try { const r = await saveSettings(s); onSaved(r.settings); } finally { setBusy(false); }
  }

  const Row = ({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      {children}
    </div>
  );
  const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!on)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-gradient-primary" : "bg-muted")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Settings</h3>
          <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* GitHub account */}
        <div className="mb-1 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          {gh?.authenticated ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://github.com/${gh.login}.png?size=64`} alt="" className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">@{gh.login}</div>
                <div className="text-[11px] text-muted-foreground">GitHub connected</div>
              </div>
              {confirmSignout ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Sure?</span>
                  <button onClick={() => { onLogout(); setConfirmSignout(false); }} className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">Sign out</button>
                  <button onClick={() => setConfirmSignout(false)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:border-primary/50">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmSignout(true)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-destructive/40 hover:text-destructive">Sign out</button>
              )}
            </>
          ) : (
            <>
              <GhIcon className="h-5 w-5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">GitHub</div>
                <div className="text-[11px] text-muted-foreground">Connect to file issues for failing tests</div>
              </div>
              <button onClick={onConnectGitHub} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#3a4149] to-[#1f2328] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.28)] ring-1 ring-white/10 transition hover:from-[#454d56] hover:to-[#24292e]">
                <GhIcon className="h-3.5 w-3.5" /> Connect GitHub
              </button>
            </>
          )}
        </div>

        {/* Workspace */}
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <FolderGit2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Projects root</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{rootPath}</div>
          </div>
          <button onClick={onChangeRoot} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary/50">Change</button>
        </div>
        <div className="mb-1 mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <Globe className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Websites &amp; domains</div>
            <div className="text-[11px] text-muted-foreground">Main + staging URLs for the base-URL dropdown</div>
          </div>
          <button onClick={onManageWebsites} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary/50">Manage</button>
        </div>

        <Row title="Run headed by default" desc="Show the browser window when running tests">
          <Toggle on={s.defaultHeaded} onChange={(v) => setS({ ...s, defaultHeaded: v })} />
        </Row>
        <Row title="Auto-open failures panel" desc="After a run with failures, open the issue panel">
          <Toggle on={s.autoOpenFailPanel} onChange={(v) => setS({ ...s, autoOpenFailPanel: v })} />
        </Row>
        <Row title="Workers" desc="Parallel workers (blank = Playwright default)">
          <input className={input} type="number" min={1} value={s.workers ?? ""} onChange={(e) => setS({ ...s, workers: e.target.value ? Number(e.target.value) : null })} placeholder="auto" />
        </Row>
        <Row title="Retries" desc="Retry failed tests">
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} onClick={() => setS({ ...s, retries: n === 0 ? null : n })}
                className={cn("h-7 w-8 rounded-md text-xs font-semibold transition", (s.retries ?? 0) === n ? "bg-background text-primary shadow-soft" : "text-muted-foreground hover:text-foreground")}>{n}</button>
            ))}
          </div>
        </Row>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:border-primary/50">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-50">Save settings</button>
        </div>
      </div>
    </div>
  );
}

function toConsoleLine(raw: string): ConsoleLine {
  const text = raw;
  if (/^\s*\$/.test(text)) return { kind: "cmd", text };
  if (/✓|\bpassed\b|\bok\b/i.test(text) && !/fail/i.test(text)) return { kind: "ok", text };
  if (/✗|✘|error|fail|timed ?out/i.test(text)) return { kind: "err", text };
  if (/skip/i.test(text)) return { kind: "warn", text };
  return { kind: "info", text };
}

// ---- Websites & domains manager ----
function WebsitesModal({ onClose, projects }: { onClose: () => void; projects: UIProject[] }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [formOpen, setFormOpen] = useState<null | { edit?: Site }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getWebsites().then((r) => setSites(r.sites)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    setBusy(true);
    try { const r = await websiteAction({ action: "delete", id }); setSites(r.sites); } finally { setBusy(false); }
  }
  async function saveSite(data: { name: string; prod: string; staging?: string; project?: string }, editingId?: string): Promise<string | null> {
    try {
      const r = editingId
        ? await websiteAction({ action: "update", id: editingId, site: data })
        : await websiteAction({ action: "add", site: data });
      setSites(r.sites); setFormOpen(null);
      return null;
    } catch (e) { return (e as Error).message; }
  }
  const projName = (id?: string) => projects.find((p) => p.id === id)?.name;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Websites &amp; domains</h3>
            <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Main + staging domains feed the base-URL dropdown. Saved in <span className="font-mono">websites.json</span> at your projects root.</p>

          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{sites.length} website{sites.length === 1 ? "" : "s"}</span>
            <button onClick={() => setFormOpen({})} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-3 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95">
              <Plus className="h-4 w-4" /> Add website
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin rounded-xl border border-border">
            {sites.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">No websites yet. Add your first.</div>}
            {sites.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-muted/60">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {s.name}
                    {s.project && <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"><FolderGit2 className="h-3 w-3" />{projName(s.project) ?? s.project}</span>}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{s.prod}{s.staging ? `  ·  ${s.staging}` : ""}</div>
                </div>
                <button onClick={() => setFormOpen({ edit: s })} disabled={busy} title="Edit" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/50 hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(s.id)} disabled={busy} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {formOpen && <WebsiteForm initial={formOpen.edit} projects={projects} onClose={() => setFormOpen(null)} onSave={saveSite} />}
    </>
  );
}

function WebsiteForm({ initial, projects, onClose, onSave }: {
  initial?: Site; projects: UIProject[]; onClose: () => void; onSave: (data: { name: string; prod: string; staging?: string; project?: string }, editingId?: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prod, setProd] = useState(initial?.prod ?? "");
  const [staging, setStaging] = useState(initial?.staging ?? "");
  const [project, setProject] = useState(initial?.project ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

  async function submit() {
    if (!name.trim() || !prod.trim()) { setError("Name and main URL are required"); return; }
    setBusy(true); setError(null);
    const err = await onSave({ name: name.trim(), prod: prod.trim(), staging: staging.trim() || undefined, project: project || undefined }, initial?.id);
    if (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">{initial ? "Edit website" : "Add website"}</h3>
          <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className={label}>Name</label><input className={input} placeholder="e.g. Acme" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><label className={label}>Main URL</label><input className={cn(input, "font-mono")} placeholder="https://acme.com" value={prod} onChange={(e) => setProd(e.target.value)} /></div>
          <div><label className={label}>Staging URL <span className="normal-case text-muted-foreground/70">(optional)</span></label><input className={cn(input, "font-mono")} placeholder="https://staging.acme.com" value={staging} onChange={(e) => setStaging(e.target.value)} /></div>
          <div><label className={label}>Linked project <span className="normal-case text-muted-foreground/70">(optional)</span></label>
            <select className={input} value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">— none —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:border-primary/50">Cancel</button>
          <button onClick={submit} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-50">{initial ? "Save changes" : "Add website"}</button>
        </div>
      </div>
    </div>
  );
}
