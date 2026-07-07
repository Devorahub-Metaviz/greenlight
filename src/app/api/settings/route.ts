import { NextResponse } from "next/server";
import { readSettings, writeSettings, type Settings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: await readSettings() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<Settings> = {};
  if (typeof body.defaultHeaded === "boolean") patch.defaultHeaded = body.defaultHeaded;
  if (typeof body.autoOpenFailPanel === "boolean") patch.autoOpenFailPanel = body.autoOpenFailPanel;
  if (body.workers === null || typeof body.workers === "number") patch.workers = body.workers;
  if (body.retries === null || typeof body.retries === "number") patch.retries = body.retries;
  return NextResponse.json({ settings: await writeSettings(patch) });
}
