import { NextResponse } from "next/server";
import { getStatus, setClientId, startDeviceFlow, pollDeviceToken, logout } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStatus());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  try {
    if (action === "setClientId") {
      if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
      await setClientId(String(body.clientId));
      return NextResponse.json(await getStatus());
    }
    if (action === "startDevice") {
      return NextResponse.json(await startDeviceFlow());
    }
    if (action === "pollDevice") {
      if (!body.device_code) return NextResponse.json({ error: "device_code required" }, { status: 400 });
      return NextResponse.json(await pollDeviceToken(String(body.device_code)));
    }
    if (action === "logout") {
      await logout();
      return NextResponse.json(await getStatus());
    }
    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
