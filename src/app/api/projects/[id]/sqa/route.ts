import { NextResponse } from "next/server";
import { resolveProject } from "@/lib/projects";
import { readSqa, writeSqa, createStarterSpec } from "@/lib/sqa";
import type { ChecklistItem, SqaFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const sqa = await readSqa(project.path, project.name);
  return NextResponse.json({ sqa });
}

function coerceItem(raw: unknown): ChecklistItem {
  const o = (raw ?? {}) as Partial<ChecklistItem>;
  return {
    id: String(o.id ?? "").trim(),
    title: String(o.title ?? "").trim(),
    module: String(o.module ?? "").trim() || "general",
    feature: o.feature ? String(o.feature).trim() || undefined : undefined,
    tests: Array.isArray(o.tests) ? o.tests.map(String) : [],
    priority: (o.priority as ChecklistItem["priority"]) ?? "medium",
    status: (o.status as ChecklistItem["status"]) ?? "open",
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const sqa = await readSqa(project.path, project.name);

  try {
    if (action === "add") {
      const item = coerceItem(body.item);
      if (!item.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (sqa.checklist.some((c) => c.id === item.id)) {
        return NextResponse.json({ error: `id "${item.id}" already exists` }, { status: 400 });
      }
      const specPath = await createStarterSpec(project.path, item);
      if (!item.tests.includes(specPath)) item.tests.push(specPath);
      sqa.checklist.push(item);
    } else if (action === "update") {
      const item = coerceItem(body.item);
      const idx = sqa.checklist.findIndex((c) => c.id === body.originalId || c.id === item.id);
      if (idx === -1) return NextResponse.json({ error: "item not found" }, { status: 404 });
      sqa.checklist[idx] = item;
    } else if (action === "delete") {
      // Removes only the checklist entry; the .spec.ts file is left on disk.
      const delId = String(body.id ?? "");
      sqa.checklist = sqa.checklist.filter((c) => c.id !== delId);
    } else if (action === "reorder") {
      const order: string[] = Array.isArray(body.order) ? body.order.map(String) : [];
      const map = new Map(sqa.checklist.map((c) => [c.id, c]));
      const reordered = order.map((oid) => map.get(oid)).filter(Boolean) as ChecklistItem[];
      // keep any items not present in `order` at the end
      for (const c of sqa.checklist) if (!order.includes(c.id)) reordered.push(c);
      sqa.checklist = reordered;
    } else if (action === "save") {
      sqa.checklist = Array.isArray(body.checklist) ? body.checklist.map(coerceItem) : sqa.checklist;
    } else if (action === "import") {
      const incoming = Array.isArray(body.checklist) ? body.checklist.map(coerceItem) : [];
      const mode = body.mode === "merge" ? "merge" : "replace";
      const modules: Record<string, string> = { ...(sqa.modules ?? {}), ...(body.modules && typeof body.modules === "object" ? body.modules : {}) };
      let checklist: ChecklistItem[] = mode === "merge" ? [...sqa.checklist] : [];
      for (const item of incoming) {
        if (!item.id) continue;
        const idx = checklist.findIndex((c) => c.id === item.id);
        if (idx >= 0) checklist[idx] = item; else checklist.push(item);
        if (body.createSpecs !== false) {
          const specPath = await createStarterSpec(project.path, item);
          if (!item.tests.includes(specPath)) item.tests.push(specPath);
        }
      }
      const next: SqaFile = { project: sqa.project, checklist, modules };
      await writeSqa(project.path, next);
      return NextResponse.json({ sqa: next });
    } else if (action === "setModule") {
      const mod = String(body.module ?? "").trim();
      const desc = String(body.description ?? "").trim();
      if (!mod) return NextResponse.json({ error: "module required" }, { status: 400 });
      const modules = { ...(sqa.modules ?? {}) };
      if (desc) modules[mod] = desc; else delete modules[mod];
      sqa.modules = modules;
    } else {
      return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }

    await writeSqa(project.path, sqa);
    return NextResponse.json({ sqa });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
