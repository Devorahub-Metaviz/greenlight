import { NextResponse } from "next/server";
import { readConfig, writeConfig, assertDir } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await readConfig();
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectsRoot = typeof body.projectsRoot === "string" ? body.projectsRoot.trim() : "";
  if (!projectsRoot) {
    return NextResponse.json({ error: "projectsRoot is required" }, { status: 400 });
  }
  try {
    await assertDir(projectsRoot);
  } catch {
    return NextResponse.json({ error: `Folder not found: ${projectsRoot}` }, { status: 400 });
  }
  await writeConfig({ projectsRoot });
  return NextResponse.json({ projectsRoot });
}
