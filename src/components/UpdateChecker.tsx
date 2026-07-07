"use client";
import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

// Only meaningful inside the Tauri desktop shell - a no-op in the plain web app
// (dev server / any browser deployment), where __TAURI_INTERNALS__ is absent.
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type UpdateHandle = {
  version: string;
  body?: string | null;
  downloadAndInstall: () => Promise<void>;
};

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateHandle | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const found = await check();
        if (!cancelled && found) {
          setUpdate({ version: found.version, body: found.body, downloadAndInstall: () => found.downloadAndInstall() });
        }
      } catch (e) {
        // Offline / no release yet / network hiccup - fail silently, not user-facing.
        console.warn("update check failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function install() {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setError((e as Error).message);
      setInstalling(false);
    }
  }

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-elevated">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white">
          {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">Update available · v{update.version}</div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {update.body || "A new version of Greenlight is ready to install."}
          </p>
          {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={install}
              disabled={installing}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-primary px-3 text-xs font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-60"
            >
              {installing ? "Installing…" : "Install & Restart"}
            </button>
            <button
              onClick={() => setDismissed(true)}
              disabled={installing}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-primary/50 disabled:opacity-60"
            >
              Later
            </button>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} disabled={installing} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
