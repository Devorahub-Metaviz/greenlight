import { NextResponse } from "next/server";
import { readWebsites, addSite, updateSite, deleteSite, type Site } from "@/lib/websites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readWebsites();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  try {
    if (action === "add") {
      const raw = body.site ?? {};
      const name = String(raw.name ?? "").trim();
      const prod = String(raw.prod ?? "").trim();
      const staging = raw.staging ? String(raw.staging).trim() : undefined;
      const project = raw.project ? String(raw.project).trim() : undefined;
      const id = String(raw.id ?? name).trim().toLowerCase().replace(/\s+/g, "-");
      if (!name || !prod) return NextResponse.json({ error: "name and prod URL are required" }, { status: 400 });
      const site: Site = { id, name, prod, staging, project };
      const data = await addSite(site);
      return NextResponse.json(data);
    }
    if (action === "update") {
      const id = String(body.id ?? "").trim();
      const raw = body.site ?? {};
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Partial<Site> = {
        name: raw.name !== undefined ? String(raw.name).trim() : undefined,
        prod: raw.prod !== undefined ? String(raw.prod).trim() : undefined,
        staging: raw.staging !== undefined ? (String(raw.staging).trim() || undefined) : undefined,
        project: raw.project !== undefined ? (String(raw.project).trim() || undefined) : undefined,
      };
      const data = await updateSite(id, patch);
      return NextResponse.json(data);
    }
    if (action === "delete") {
      const data = await deleteSite(String(body.id ?? ""));
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
