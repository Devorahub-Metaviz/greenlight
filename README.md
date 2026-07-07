# E2E Orchestrator

A local web app to run and manage Playwright E2E regression tests across multiple projects. Point it at a folder of projects, browse each project's tests module-by-module, run any/bulk/all with a live console, and manage an SQA checklist per project. Every run is logged so you can see each test's last status and when it last broke.

> Web UI first (this repo). A desktop wrapper (Tauri/Electron) can be added later around the same app.

## Requirements
- Node 22+
- Each target project uses Playwright (`@playwright/test`) with `testDir: "./e2e"`.

## Run
```bash
npm install
npm run dev
```
Open the printed URL, then set your **projects root** folder. Any subfolder containing an `e2e/` directory shows up as a project.

## Project convention
```
<projects-root>/<project>/
  playwright.config.ts     # testDir: "./e2e", reads PLAYWRIGHT_BASE_URL
  sqa.json                 # SQA checklist (managed in-app)
  orchestrator.json        # base URL presets (optional)
  e2e/<module>/<id>.spec.ts
  e2e/logs/                # one run-<timestamp>.json per run (auto)
```

## Features
- **Projects sidebar** - scans the chosen root; rescan button.
- **Tests tab** - module tree, search, single/bulk/select-all, per-test status badge + last-run time.
- **Run controls** - headed/headless toggle, base URL preset dropdown, live streamed console.
- **Checklist tab** - full CRUD on `sqa.json`: add (creates a starter spec), edit, delete (keeps the spec file), priority, sort/reorder.
- **History tab** - every run with pass/fail breakdown and error output.
- **Docs tab** - in-app setup instructions.

## Try the demo
A sample project ships under `sample-projects/demo-app` (one passing + one failing test). Set the projects root to `sample-projects` to explore.
