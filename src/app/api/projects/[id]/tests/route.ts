import { NextResponse } from "next/server";
import { resolveProject } from "@/lib/projects";
import { listModuleGroups } from "@/lib/tests";
import { computeHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [modules, history] = await Promise.all([
    listModuleGroups(project.path),
    computeHistory(project.path),
  ]);
  return NextResponse.json({ modules, history });
}
