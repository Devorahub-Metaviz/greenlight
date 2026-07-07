import { NextResponse } from "next/server";
import { readConnections, getConnection, setConnection, deleteConnection, type Connection } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (projectId) return NextResponse.json({ connection: await getConnection(projectId) });
  return NextResponse.json({ connections: await readConnections() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  if (body.action === "delete") {
    await deleteConnection(projectId);
    return NextResponse.json({ connection: null });
  }

  const owner = String(body.owner ?? "").trim();
  const repo = String(body.repo ?? "").trim();
  if (!owner || !repo) return NextResponse.json({ error: "owner and repo required" }, { status: 400 });
  const conn: Connection = {
    owner,
    repo,
    boardId: body.boardId ? String(body.boardId) : undefined,
    boardTitle: body.boardTitle ? String(body.boardTitle) : undefined,
    boardNumber: typeof body.boardNumber === "number" ? body.boardNumber : undefined,
  };
  await setConnection(projectId, conn);
  return NextResponse.json({ connection: conn });
}
