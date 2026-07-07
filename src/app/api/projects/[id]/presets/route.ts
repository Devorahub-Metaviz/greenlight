import { NextResponse } from "next/server";
import { resolveProject } from "@/lib/projects";
import { readPresets } from "@/lib/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const presets = await readPresets(project.path);
  return NextResponse.json({ presets });
}
