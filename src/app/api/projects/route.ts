import { NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { scanProjects } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { projectsRoot } = await readConfig();
  if (!projectsRoot) {
    return NextResponse.json({ projectsRoot: null, projects: [] });
  }
  const projects = await scanProjects(projectsRoot);
  return NextResponse.json({ projectsRoot, projects });
}
