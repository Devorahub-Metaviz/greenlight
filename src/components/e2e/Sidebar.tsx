import { useEffect, useState } from "react";
import { Folder, Leaf, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Project, TestItem } from "@/lib/e2e-mock";
import { cn } from "@/lib/utils";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!inTauri()) return;
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersion).catch(() => {});
  }, []);
  return version;
}

interface Props {
  projects: Project[];
  tests: Record<string, TestItem[]>;
  selectedId: string;
  onSelect: (id: string) => void;
  rootPath: string;
  onChangeRoot?: () => void;
  onManageWebsites?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ projects, selectedId, onSelect, rootPath, onChangeRoot, onManageWebsites, collapsed, onToggleCollapse }: Props) {
  const version = useAppVersion();
  if (collapsed) {
    return (
      <aside className="flex h-full w-16 shrink-0 flex-col items-center gap-3 border-r border-border bg-sidebar py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elevated"><Leaf className="h-5 w-5 text-white" strokeWidth={2.5} /></div>
        <div className="my-1 h-px w-8 bg-border" />
        <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto scrollbar-thin">
          {projects.map((p) => {
            const active = p.id === selectedId;
            return (
              <button key={p.id} onClick={() => onSelect(p.id)} title={p.name}
                className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition", active ? "bg-sidebar-accent text-primary shadow-soft" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground")}>
                <Folder className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <button onClick={onToggleCollapse} title="Expand sidebar" className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition hover:text-foreground hover:border-primary/50">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-elevated">
          <Leaf className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">Greenlight</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">e2e regression</div>
        </div>
      </div>

      {/* Projects */}
      <div className="px-4 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projects</div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        {projects.map((p) => {
          const active = p.id === selectedId;
          return (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className={cn("group mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft" : "text-sidebar-foreground hover:bg-sidebar-accent/50")}>
              <Folder className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1 truncate text-left font-medium">{p.name}</span>
              {!p.hasSqa && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">no sqa</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <button onClick={onToggleCollapse} title="Collapse sidebar"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-sidebar-accent/50 hover:text-foreground">
          <PanelLeftClose className="h-4 w-4" /> Collapse
        </button>
        {version && <span className="ml-auto text-[11px] text-muted-foreground">v{version}</span>}
      </div>
    </aside>
  );
}
