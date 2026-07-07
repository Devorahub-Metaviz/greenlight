import { NextResponse } from "next/server";
import { listProjectBoards } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 });
  try {
    return NextResponse.json({ boards: await listProjectBoards(owner) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
