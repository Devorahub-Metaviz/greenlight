"use client";
import { useRef, useState } from "react";
import { Check, Copy, Download, FolderGit2, Upload } from "lucide-react";
import { getSqa, importSqa } from "@/lib/client";

const CLONE_PROMPT = `git clone https://github.com/Devorahub-Metaviz/sqa.git
cd sqa`;

// The one prompt a user ever needs to copy. README.md (in the cloned repo)
// carries every other instruction - shared install, skill file, project
// scaffold - so Claude reads it and does the rest without more copy/paste.
const BOOTSTRAP_PROMPT = `Read README.md in this folder and set the workspace up for a new project called "<name>": install the shared Playwright dependency if missing, create the e2e-test skill if it isn't there yet, then scaffold the project exactly as documented. Ask me for the project's base URL if you need it.`;

const SAMPLE = `{
  "project": "str",
  "modules": {
    "homepage": "Homepage, destinations grid and hero",
    "search": "Venue search, filters and results"
  },
  "checklist": [
    { "id": "homepage-1", "title": "Homepage loads with the destinations grid",
      "module": "homepage", "tests": ["e2e/homepage/homepage-1.spec.ts"],
      "priority": "high", "status": "open" },
    { "id": "search-1", "title": "Search returns matching venues",
      "module": "search", "tests": ["e2e/search/search-1.spec.ts"],
      "priority": "medium", "status": "open" }
  ]
}`;

const CHECKLIST_PROMPT = `You are helping build an E2E regression checklist for a web app.
Output ONLY valid JSON in exactly this shape (no prose):

${SAMPLE}

Rules:
- "id" is a kebab-case test id like "<module>-<n>" (e.g. search-1). It is also the spec file name.
- Group related scenarios under a "module" (homepage, search, listing, inquiry, auth, ...).
- "modules" maps each module name to a one-line description.
- "priority" is high | medium | low. "status" starts as "open".
- One checklist item = one scenario = one spec file at e2e/<module>/<id>.spec.ts.

Now generate a thorough checklist for the following app/feature:
<describe your app or paste your requirements here>`;

export function DocsTab({ projectId, onImported }: { projectId?: string; onImported?: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportSqa() {
    if (!projectId) return;
    const { sqa } = await getSqa(projectId);
    const blob = new Blob([JSON.stringify(sqa, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${projectId}-sqa.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await importSqa(projectId, { checklist: data.checklist ?? [], modules: data.modules ?? {}, createSpecs: true, mode: "merge" });
      setMsg(`Imported ${r.sqa.checklist.length} items (starter specs created).`);
      onImported?.();
    } catch (err) {
      setMsg(`Import failed: ${(err as Error).message}`);
    }
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin bg-background">
      <article className="mx-auto w-full max-w-3xl px-8 py-10">
        <header className="mb-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">instructions</div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up &amp; run E2E tests</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Greenlight is a thin layer over Playwright for the QA team. Your workspace holds only test artifacts, no app or repo code. Clone the shared scaffold, paste one prompt, and Claude reads the workspace&apos;s own README to do the rest.
          </p>
        </header>

        {/* Toolbar: export / import an existing checklist */}
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
          <button onClick={exportSqa} disabled={!projectId} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:border-primary/50 disabled:opacity-50">
            <Download className="h-4 w-4" /> Export sqa.json
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={!projectId} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:border-primary/50 disabled:opacity-50">
            <Upload className="h-4 w-4" /> Import (creates specs)
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>

        <Section title="The full flow">
          <ol className="ml-1 space-y-1.5 text-muted-foreground">
            <FlowItem n={1}>Clone the shared workspace (below).</FlowItem>
            <FlowItem n={2}>Paste the one setup prompt - Claude reads <span className="font-mono text-foreground">README.md</span> and scaffolds everything.</FlowItem>
            <FlowItem n={3}>Point Greenlight&apos;s projects root at the cloned folder (sidebar &gt; Change root, or Settings).</FlowItem>
            <FlowItem n={4}>Generate a checklist, import it here, then just ask Claude to write the scenarios - the skill from step 2 keeps it to convention.</FlowItem>
            <FlowItem n={5}>Run from the Tests tab and file issues for failures.</FlowItem>
          </ol>
        </Section>

        <Section title="Step 1 - Clone the shared QA workspace">
          <p className="text-muted-foreground">Shared Playwright install, the <span className="font-mono text-foreground">e2e-test</span> skill, and the setup guide all live at <span className="font-mono text-foreground">github.com/Devorahub-Metaviz/sqa</span>.</p>
          <CopyBlock text={CLONE_PROMPT} />
        </Section>

        <Section title="Step 2 - One prompt, Claude does the rest">
          <p className="text-muted-foreground">Open the cloned folder in Claude Code and paste this. Everything else - the shared install, the skill file, the project scaffold - is documented in that workspace&apos;s own <span className="font-mono text-foreground">README.md</span>, so there&apos;s nothing else to copy.</p>
          <CopyBlock text={BOOTSTRAP_PROMPT} />
        </Section>

        <Section title="Folder structure (for reference)">
          <p className="text-muted-foreground">A project is Playwright/TypeScript, pytest/Python, or both at once - each test file is routed to the runner that owns its extension.</p>
          <Code>{`sqa/                         # QA root - no app / repo code
  .claude/skills/e2e-test/    # the skill, keeps tests + sqa.json in sync
  str/                       # a project (one site under test)
    sqa.json                 # checklist (modules + one item per test)
    e2e/
      <module>/<id>.spec.ts   # Playwright/TS: one spec file per test case
      <Module>/tc<n>_<slug>.py  # pytest: one file per test case
      logs/                   # run logs, generated automatically

  # Playwright projects also have playwright.config.ts (shared node_modules
  # at the QA root). pytest projects also have their own requirements.txt
  # and pytest.ini (python_files = tc*.py, addopts --base-url=<site>).`}</Code>
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-[13px] text-muted-foreground">
            <FolderGit2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Playwright projects never get their own <span className="font-mono text-foreground">package.json</span>/<span className="font-mono text-foreground">node_modules</span> - Node resolves Playwright by walking up to a shared root install. pytest projects keep their own <span className="font-mono text-foreground">requirements.txt</span> instead, since Python venvs are per-project.</span>
          </div>
        </Section>

        <Section title="Step 3 - Generate a checklist">
          <p className="text-muted-foreground">Paste into any AI, describe your app, and it returns JSON in the shape below. Import it with the button above to auto-create the spec files.</p>
          <CopyBlock text={CHECKLIST_PROMPT} />
          <p className="pt-1 text-muted-foreground">Expected shape (sqa.json):</p>
          <Code>{SAMPLE}</Code>
        </Section>

        <Section title="Step 4 - Run &amp; file issues">
          <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
            <li>Select tests (single, module, or all) and hit <Kbd>Run</Kbd>. Output streams into the console.</li>
            <li>Pick the environment (main / staging) from <Kbd>Websites &amp; domains</Kbd>.</li>
            <li>On failures, the panel lets you file GitHub issues (one, some, or all) and drop cards on your board.</li>
          </ul>
        </Section>
      </article>
    </div>
  );
}

// One copyable prompt block with its own Copy button.
function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <div className="relative">
      <button onClick={copy}
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground shadow-soft transition hover:border-primary/50">
        {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="overflow-x-auto rounded-xl border border-border bg-[var(--color-console-bg)] p-4 pr-24 font-mono text-[12.5px] leading-relaxed text-[var(--color-console-fg)] scrollbar-thin">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function FlowItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-[11px] font-bold text-white">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-[var(--color-console-bg)] p-4 font-mono text-[12.5px] leading-relaxed text-[var(--color-console-fg)] scrollbar-thin">
      <code>{children}</code>
    </pre>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-block rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{children}</span>;
}
