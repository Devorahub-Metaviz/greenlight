import { NextResponse } from "next/server";
import { resolveProject } from "@/lib/projects";
import { readRuns } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const runs = await readRuns(project.path);
  return NextResponse.json({ runs });
}
