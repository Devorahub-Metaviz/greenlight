"use client";
import { useRef, useState } from "react";
import { Check, Copy, Download, FolderGit2, Upload } from "lucide-react";
import { getSqa, importSqa } from "@/lib/client";

// Fastest path: clone the shared QA scaffold repo instead of asking an AI to
// build it from scratch. Same content as the setup prompt below, pre-built.
const CLONE_PROMPT = `git clone https://github.com/Devorahub-Metaviz/sqa.git
cd sqa
npm install`;

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

// ---- Copyable prompts (each has its own Copy button in the flow below) ----

const SETUP_PROMPT = `You are setting up an E2E QA workspace for Greenlight (a Playwright test runner).

First, if this QA root has no package.json yet, create ONE shared install at the
root (not per project):
  package.json -> private package, devDependency "@playwright/test": "1.61.1"
Then run: npm install
Every project below shares this single node_modules - never add a package.json or
node_modules inside a project folder.

Now create a new project folder named "str" inside the QA root. It must hold ONLY
test artifacts - no application or repo code, and no package.json/node_modules.

Create exactly this structure:

  str/
    playwright.config.ts
    sqa.json
    e2e/
      logs/.gitkeep

File contents:
- playwright.config.ts -> defineConfig({ testDir: "./e2e", timeout: 30000,
  reporter: "list", use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ||
  "https://strwedding.com", trace: "retain-on-failure" } })
- sqa.json -> { "project": "str", "modules": {}, "checklist": [] }

Confirm the final tree. Do not create any source code.`;

const SKILL_PROMPT = `Create a Claude Code skill so you can scaffold and write Playwright E2E tests in
this QA workspace. Write the file:

  .claude/skills/e2e-test/SKILL.md

with YAML frontmatter:
  name: e2e-test
  description: Scaffold and write Playwright E2E specs in the Greenlight QA
    workspace (e2e/<module>/<id>.spec.ts kept in sync with sqa.json). Use when
    asked to add tests, a module, or scenarios for a project under this QA root.

and a body that instructs you to:
- Put one spec per test at e2e/<module>/<id>.spec.ts, ids kebab-case (<module>-<n>).
- Keep sqa.json in sync: every spec has a matching checklist item
  (id, title, module, priority, status: "open"); add the module description if new.
- Never create a package.json or node_modules inside a project folder - Playwright
  is installed once at the QA root and every project shares it.
- Read baseURL from the Playwright config / PLAYWRIGHT_BASE_URL; never hardcode a
  domain. Navigate with relative paths, e.g. page.goto("/venues").
- Write real assertions with robust locators (getByRole, getByText, toHaveURL,
  toBeVisible); no arbitrary waits or sleeps; one independent test per file.
- Touch only files under this QA workspace, never app or repo code.
- After writing specs, list them and remind the user to run them in Greenlight.

After creating the file, confirm the skill is installed.`;

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

const SCRIPTS_PROMPT = `Use the e2e-test skill to write Playwright specs for the "<module>" module of the
str project.

For each scenario below:
- Create e2e/<module>/<module>-<n>.spec.ts following the workspace convention.
- Add or update the matching item in sqa.json (id, title, module, priority, status).
- Use getByRole / getByText locators and real assertions against the base URL
  (relative page.goto paths, never a hardcoded domain).

Scenarios to cover:
<paste the scenarios or requirements here>`;

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
            Greenlight is a thin layer over Playwright for the QA team. Your workspace holds only test artifacts, no app or repo code: one folder per project, and inside it the modules, scripts and logs. Follow the flow below - copy each prompt into Claude Code (or any AI agent in the workspace) and it does the setup for you.
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

        {/* The full flow */}
        <Section title="The full flow">
          <ol className="ml-1 space-y-1.5 text-muted-foreground">
            <FlowItem n={0}>Fastest: <b className="text-foreground">clone the shared scaffold repo</b> instead of building one from scratch.</FlowItem>
            <FlowItem n={1}>Point Greenlight&apos;s projects root at that folder (sidebar &gt; Change root, or Settings).</FlowItem>
            <FlowItem n={2}>Starting fresh instead? Copy the <b className="text-foreground">setup prompt</b> to scaffold a new project by hand.</FlowItem>
            <FlowItem n={3}>Copy the <b className="text-foreground">skill prompt</b> so Claude can write tests to convention.</FlowItem>
            <FlowItem n={4}>Copy the <b className="text-foreground">checklist prompt</b>, generate a checklist, import it here.</FlowItem>
            <FlowItem n={5}>Copy the <b className="text-foreground">scripts prompt</b> to fill in real test steps, then run in the Tests tab.</FlowItem>
          </ol>
        </Section>

        <Section title="Step 0 - Clone the shared QA workspace (fastest)">
          <p className="text-muted-foreground">The scaffold - shared Playwright install, the <span className="font-mono text-foreground">e2e-test</span> skill, and a starter project - already lives at <span className="font-mono text-foreground">github.com/Devorahub-Metaviz/sqa</span>. Clone it and point Greenlight&apos;s root there; no AI setup step needed.</p>
          <CopyBlock text={CLONE_PROMPT} />
        </Section>

        <Section title="Folder structure (and where it lives)">
          <p className="text-muted-foreground">Create a dedicated QA root (for example <span className="font-mono text-foreground">D:/Fiaz/sqa</span>). It has <b className="text-foreground">no application or repo code</b> - only projects, and inside each project the modules, scripts and logs. Point Greenlight at this root; any subfolder with an <span className="font-mono">e2e/</span> directory becomes a project.</p>
          <Code>{`sqa/                         # QA root - no app / repo code
  package.json               # ONE shared @playwright/test install
  node_modules/               # shared by every project below - install once here
  str/                       # a project (one site under test)
    playwright.config.ts     # testDir ./e2e, baseURL from env
    sqa.json                 # checklist (modules + one item per test)
    e2e/
      <module>/<id>.spec.ts   # modules (folders) + scripts (specs)
      logs/                   # run logs, generated automatically`}</Code>
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-[13px] text-muted-foreground">
            <FolderGit2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Projects never get their own <span className="font-mono text-foreground">package.json</span>/<span className="font-mono text-foreground">node_modules</span> - Node resolves Playwright by walking up to the shared root install, so adding a project costs zero install time.</span>
          </div>
        </Section>

        <Section title="Step 1 - Scaffold the project">
          <p className="text-muted-foreground">Open the QA root in Claude Code and paste this. It creates the folders, config and an empty checklist, then installs Playwright.</p>
          <CopyBlock text={SETUP_PROMPT} />
        </Section>

        <Section title="Step 2 - Install the Claude skill">
          <p className="text-muted-foreground">This installs an <span className="font-mono text-foreground">e2e-test</span> skill so Claude always writes specs to the convention and keeps <span className="font-mono">sqa.json</span> in sync. Paste it once per workspace - the file is written to <span className="font-mono">.claude/skills/e2e-test/SKILL.md</span> and the skill is ready.</p>
          <CopyBlock text={SKILL_PROMPT} />
        </Section>

        <Section title="Step 3 - Generate a checklist">
          <p className="text-muted-foreground">Paste into any AI, describe your app, and it returns JSON in the shape below. Import it with the button above to auto-create the spec files.</p>
          <CopyBlock text={CHECKLIST_PROMPT} />
          <p className="pt-1 text-muted-foreground">Expected shape (sqa.json):</p>
          <Code>{SAMPLE}</Code>
        </Section>

        <Section title="Step 4 - Write the test scripts">
          <p className="text-muted-foreground">The import creates starter specs (a TODO per test). Use the skill to fill in real steps for a module.</p>
          <CopyBlock text={SCRIPTS_PROMPT} />
        </Section>

        <Section title="Step 5 - Run &amp; file issues">
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
