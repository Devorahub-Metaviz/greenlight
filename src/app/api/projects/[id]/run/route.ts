import { resolveProject } from "@/lib/projects";
import { readPresets, resolveBaseUrl } from "@/lib/presets";
import { runTests } from "@/lib/runner";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// Streams Server-Sent Events: `log` lines during the run, then a final `done` event with the RunLog.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const selection: string[] = Array.isArray(body.selection) ? body.selection.map(String) : [];
  const headed = Boolean(body.headed);
  // Prefer an explicit baseURL (from the websites/domains dropdown); fall back to a per-project preset.
  const presets = await readPresets(project.path);
  const baseURL = typeof body.baseURL === "string" && body.baseURL.trim()
    ? body.baseURL.trim()
    : resolveBaseUrl(presets, body.preset);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const settings = await readSettings();
        const log = await runTests({
          projectPath: project.path,
          selection,
          headed,
          baseURL,
          workers: settings.workers,
          retries: settings.retries,
          onLine: (line) => send("log", { line }),
        });
        send("done", log);
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
