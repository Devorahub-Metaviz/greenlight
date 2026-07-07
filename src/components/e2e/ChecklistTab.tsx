"use client";
import { useMemo, useState } from "react";
import { Boxes, FlaskConical, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ChecklistItem, Priority } from "@/lib/e2e-mock";
import { PriorityTag } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  moduleDescriptions?: Record<string, string>;
  onSetModuleDesc?: (module: string, description: string) => void;
}

type View = "tests" | "modules";
const PRIORITIES: Priority[] = ["low", "medium", "high"];

export function ChecklistTab({ items, onChange, moduleDescriptions = {}, onSetModuleDesc }: Props) {
  const [view, setView] = useState<View>("tests");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [editModule, setEditModule] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: "test" | "module"; id: string } | null>(null);
  const [dragModule, setDragModule] = useState<string | null>(null);
  const [overModule, setOverModule] = useState<string | null>(null);
  const [dragTest, setDragTest] = useState<{ module: string; id: string } | null>(null);
  const [overTest, setOverTest] = useState<string | null>(null);

  const moduleOrder = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) if (it.module && !seen.includes(it.module)) seen.push(it.module);
    for (const m of Object.keys(moduleDescriptions)) if (m && !seen.includes(m)) seen.push(m);
    return seen;
  }, [items, moduleDescriptions]);

  const grouped = useMemo(
    () => moduleOrder.map((m) => ({ module: m, items: items.filter((i) => i.module === m) })),
    [moduleOrder, items]
  );
  const allFeatures = useMemo(() => [...new Set(items.map((i) => i.feature).filter(Boolean) as string[])].sort(), [items]);

  // Group a module's items by feature (items without a feature go under a null bucket, shown first).
  function byFeature(mItems: ChecklistItem[]): { feature: string | null; items: ChecklistItem[] }[] {
    const order: (string | null)[] = [];
    for (const it of mItems) { const f = it.feature ?? null; if (!order.includes(f)) order.push(f); }
    return order.map((f) => ({ feature: f, items: mItems.filter((i) => (i.feature ?? null) === f) }));
  }

  function persist(order: string[], byMod: Record<string, ChecklistItem[]>) {
    const next: ChecklistItem[] = [];
    for (const m of order) for (const it of byMod[m] ?? []) next.push(it);
    onChange(next);
  }

  // ---- module ops ----
  const saveModule = (orig: string, name: string, desc: string) => {
    const clean = name.trim();
    if (clean && clean !== orig) {
      onChange(items.map((i) => (i.module === orig ? { ...i, module: clean } : i)));
      onSetModuleDesc?.(clean, desc.trim());
      onSetModuleDesc?.(orig, "");
    } else {
      onSetModuleDesc?.(orig, desc.trim());
    }
  };
  const deleteModule = (m: string) => {
    onChange(items.filter((i) => i.module !== m));
    onSetModuleDesc?.(m, "");
    setConfirmDel(null);
  };
  const reorderModules = (target: string) => {
    if (!dragModule || dragModule === target) { setDragModule(null); setOverModule(null); return; }
    const order = [...moduleOrder];
    order.splice(order.indexOf(dragModule), 1);
    order.splice(order.indexOf(target), 0, dragModule);
    const byMod: Record<string, ChecklistItem[]> = {};
    for (const m of moduleOrder) byMod[m] = items.filter((i) => i.module === m);
    persist(order, byMod);
    setDragModule(null); setOverModule(null);
  };

  // ---- test ops ----
  const deleteTest = (id: string) => { onChange(items.filter((i) => i.id !== id)); setConfirmDel(null); };
  const reorderTest = (module: string, target: string) => {
    if (!dragTest || dragTest.module !== module || dragTest.id === target) { setDragTest(null); setOverTest(null); return; }
    const mod = items.filter((i) => i.module === module);
    const from = mod.findIndex((i) => i.id === dragTest.id);
    const to = mod.findIndex((i) => i.id === target);
    const copy = [...mod]; const [mv] = copy.splice(from, 1); copy.splice(to, 0, mv);
    const byMod: Record<string, ChecklistItem[]> = {};
    for (const m of moduleOrder) byMod[m] = m === module ? copy : items.filter((i) => i.module === m);
    persist(moduleOrder, byMod);
    setDragTest(null); setOverTest(null);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        {/* Header: sub-tabs + add */}
        <div className="mb-5 flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-border bg-surface p-1">
            <button onClick={() => setView("tests")} className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition", view === "tests" ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              <FlaskConical className="h-4 w-4" /> Tests
            </button>
            <button onClick={() => setView("modules")} className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition", view === "modules" ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              <Boxes className="h-4 w-4" /> Modules
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{view === "tests" ? `${items.length} tests` : `${moduleOrder.length} modules`}</span>
          <button onClick={() => setAddOpen(true)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95">
            <Plus className="h-4 w-4" /> {view === "tests" ? "Add test" : "Add module"}
          </button>
        </div>

        {/* ---- TESTS VIEW (grouped by module) ---- */}
        {view === "tests" && (
          <div className="space-y-4">
            {grouped.length === 0 && <Empty>No tests yet. Add your first test.</Empty>}
            {grouped.map(({ module, items: mItems }) => (
              <div key={module} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2.5">
                  <span className="text-sm font-semibold text-foreground">{module}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{mItems.length}</span>
                  {moduleDescriptions[module] && <span className="truncate text-[11px] text-muted-foreground">· {moduleDescriptions[module]}</span>}
                </div>
                {mItems.length === 0 && <div className="px-4 py-4 text-center text-xs text-muted-foreground">No tests in this module.</div>}
                {byFeature(mItems).map(({ feature, items: fItems }) => (
                  <div key={feature ?? "_none"}>
                    {feature && (
                      <div className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> {feature}
                        <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium normal-case">{fItems.length}</span>
                      </div>
                    )}
                    {fItems.map((it) => (
                      <div key={it.id} draggable onDragStart={() => setDragTest({ module, id: it.id })}
                        onDragOver={(e) => { e.preventDefault(); if (overTest !== it.id) setOverTest(it.id); }} onDragLeave={() => overTest === it.id && setOverTest(null)}
                        onDrop={() => reorderTest(module, it.id)} onDragEnd={() => { setDragTest(null); setOverTest(null); }}
                        className={cn("flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0 transition-colors hover:bg-surface-muted/60",
                          dragTest?.id === it.id && "opacity-50",
                          overTest === it.id && dragTest && overTest !== dragTest.id && "bg-accent/40 shadow-[inset_0_2px_0_0_var(--color-primary)]")}>
                        <span className="flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
                        <span className="w-28 shrink-0 truncate font-mono text-xs font-semibold text-primary">{it.id}</span>
                        <span className="flex-1 truncate text-sm text-foreground">{it.title || <span className="text-muted-foreground">(no title)</span>}</span>
                        <PriorityTag priority={it.priority} />
                        <IconBtn onClick={() => setEditItem(it)} title="Edit"><Pencil className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn onClick={() => setConfirmDel({ type: "test", id: it.id })} title="Delete" tone="danger"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ---- MODULES VIEW ---- */}
        {view === "modules" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            {moduleOrder.length === 0 && <Empty>No modules yet. Add your first module.</Empty>}
            {moduleOrder.map((m) => {
              const count = items.filter((i) => i.module === m).length;
              return (
                <div key={m} draggable onDragStart={() => setDragModule(m)}
                  onDragOver={(e) => { e.preventDefault(); if (overModule !== m) setOverModule(m); }} onDragLeave={() => overModule === m && setOverModule(null)}
                  onDrop={() => reorderModules(m)} onDragEnd={() => { setDragModule(null); setOverModule(null); }}
                  className={cn("flex items-center gap-3 border-b border-border px-3 py-3.5 last:border-b-0 transition-colors hover:bg-surface-muted/60",
                    dragModule === m && "opacity-50", overModule === m && dragModule && overModule !== dragModule && "bg-accent/40 shadow-[inset_0_2px_0_0_var(--color-primary)]")}>
                  <span className="flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-primary">{m}</div>
                    <div className="truncate text-xs text-muted-foreground">{moduleDescriptions[m] || "No description"}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{count} test{count === 1 ? "" : "s"}</span>
                  <IconBtn onClick={() => setEditModule(m)} title="Edit"><Pencil className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={() => setConfirmDel({ type: "module", id: m })} title="Delete" tone="danger"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- popups ---- */}
      {addOpen && view === "tests" && (
        <TestForm title="Add test" modules={moduleOrder} features={allFeatures} onClose={() => setAddOpen(false)}
          onSave={(item) => { onChange([...items, item]); setAddOpen(false); }} />
      )}
      {addOpen && view === "modules" && (
        <ModuleForm title="Add module" onClose={() => setAddOpen(false)}
          onSave={(name, desc) => { onSetModuleDesc?.(name.trim(), desc.trim()); setAddOpen(false); }} />
      )}
      {editItem && (
        <TestForm title="Edit test" modules={moduleOrder} features={allFeatures} initial={editItem} onClose={() => setEditItem(null)}
          onSave={(item) => { onChange(items.map((i) => (i.id === editItem.id ? item : i))); setEditItem(null); }} />
      )}
      {editModule && (
        <ModuleForm title="Edit module" initialName={editModule} initialDesc={moduleDescriptions[editModule] ?? ""} onClose={() => setEditModule(null)}
          onSave={(name, desc) => { saveModule(editModule, name, desc); setEditModule(null); }} />
      )}
      {confirmDel && (
        <Confirm
          title={confirmDel.type === "module" ? "Delete module?" : "Delete test?"}
          body={confirmDel.type === "module"
            ? <>Removes <span className="font-mono text-primary">{confirmDel.id}</span> and its tests from the checklist. Spec files stay on disk.</>
            : <>Removes <span className="font-mono text-primary">{confirmDel.id}</span> from the checklist. The spec file stays on disk.</>}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => (confirmDel.type === "module" ? deleteModule(confirmDel.id) : deleteTest(confirmDel.id))}
        />
      )}
    </div>
  );
}

// ---------- shared bits ----------
const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm";
const inputCls = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95 disabled:opacity-50";
const btnGhost = "inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:border-primary/50";

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

function IconBtn({ children, onClick, title, tone }: { children: React.ReactNode; onClick: () => void; title: string; tone?: "danger" }) {
  return (
    <button onClick={onClick} title={title}
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground hover:border-primary/50",
        tone === "danger" && "hover:text-destructive hover:border-destructive/40")}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const PRI_COLOR: Record<Priority, string> = { high: "var(--color-destructive)", medium: "var(--color-warning)", low: "var(--color-success)" };
function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex gap-2">
      {PRIORITIES.map((p) => {
        const active = value === p;
        const c = PRI_COLOR[p];
        return (
          <button key={p} type="button" onClick={() => onChange(p)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold capitalize transition", !active && "border-border text-muted-foreground hover:text-foreground")}
            style={active ? { color: c, background: `color-mix(in oklab, ${c} 15%, transparent)`, borderColor: `color-mix(in oklab, ${c} 45%, transparent)` } : undefined}>
            <span className="h-2 w-2 rounded-full" style={{ background: c, opacity: active ? 1 : 0.4 }} />
            {p}
          </button>
        );
      })}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={overlay} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TestForm({ title, modules, features = [], initial, onClose, onSave }: {
  title: string; modules: string[]; features?: string[]; initial?: ChecklistItem; onClose: () => void; onSave: (item: ChecklistItem) => void;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.title ?? "");
  const [module, setModule] = useState(initial?.module ?? modules[0] ?? "");
  const [feature, setFeature] = useState(initial?.feature ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "low");
  const [error, setError] = useState<string | null>(null);
  const [newModule, setNewModule] = useState(!modules.length);

  function save() {
    if (!id.trim() || !module.trim()) { setError("id and module are required"); return; }
    onSave({
      id: id.trim(), title: name.trim(), module: module.trim(), feature: feature.trim() || undefined, priority,
      tests: initial?.tests ?? [], status: initial?.status ?? "todo",
    });
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="id"><input className={cn(inputCls, "font-mono")} placeholder="checkout-2" value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="module">
          {newModule ? (
            <div className="flex gap-1.5">
              <input className={cn(inputCls, "font-mono")} placeholder="new-module" value={module} onChange={(e) => setModule(e.target.value)} autoFocus />
              {modules.length > 0 && <button type="button" onClick={() => { setNewModule(false); setModule(modules[0]); }} className="shrink-0 rounded-lg border border-border px-2 text-xs text-muted-foreground transition hover:text-foreground">pick</button>}
            </div>
          ) : (
            <select className={cn(inputCls, "font-mono")} value={module}
              onChange={(e) => { if (e.target.value === "__new__") { setNewModule(true); setModule(""); } else setModule(e.target.value); }}>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__new__">＋ New module…</option>
            </select>
          )}
        </Field>
        <div className="col-span-2"><Field label="feature (optional)">
          <input className={cn(inputCls, "font-mono")} placeholder="e.g. login — leave blank for none" value={feature} onChange={(e) => setFeature(e.target.value)} list="feature-list" />
          <datalist id="feature-list">{features.map((f) => <option key={f} value={f} />)}</datalist>
        </Field></div>
        <div className="col-span-2"><Field label="title"><input className={inputCls} placeholder="Applies a discount code at checkout" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
        <div className="col-span-2"><Field label="priority"><PrioritySelect value={priority} onChange={setPriority} /></Field></div>
      </div>
      {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Starter spec: <span className="font-mono">e2e/{module || "<module>"}/{feature ? feature + "/" : ""}{id || "<id>"}.spec.ts</span></p>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={save}>{initial ? "Save changes" : "Add test"}</button>
      </div>
    </ModalShell>
  );
}

function ModuleForm({ title, initialName, initialDesc, onClose, onSave }: {
  title: string; initialName?: string; initialDesc?: string; onClose: () => void; onSave: (name: string, desc: string) => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [desc, setDesc] = useState(initialDesc ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label="module name (id)"><input className={cn(inputCls, "font-mono")} placeholder="checkout" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="description"><input className={inputCls} placeholder="Payment, discounts and tax at checkout" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
      {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
      {initialName && name.trim() !== initialName && name.trim() && <p className="mt-2 text-[11px] text-muted-foreground">Renaming moves all <span className="font-mono">{initialName}</span> tests to <span className="font-mono">{name.trim()}</span>.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={() => { if (!name.trim()) { setError("name required"); return; } onSave(name, desc); }}>{initialName ? "Save changes" : "Add module"}</button>
      </div>
    </ModalShell>
  );
}

function Confirm({ title, body, onCancel, onConfirm }: { title: string; body: React.ReactNode; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className={overlay} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-semibold text-foreground">{title}</h4>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnGhost} onClick={onCancel}>Cancel</button>
          <button className="h-9 rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:opacity-90" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
