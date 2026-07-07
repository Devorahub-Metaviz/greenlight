import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveProject } from "@/lib/projects";
import { getConnection, createIssue, addIssueToBoard } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IssueRecord { number: number; url: string; createdAt: string; onBoard: boolean }
type IssueMap = Record<string, IssueRecord>; // keyed by testId

function issuesFile(projectPath: string) {
  return path.join(projectPath, "e2e", "issues.json");
}
async function readRecords(projectPath: string): Promise<IssueMap> {
  try { return JSON.parse(await fs.readFile(issuesFile(projectPath), "utf8")); } catch { return {}; }
}
async function writeRecords(projectPath: string, map: IssueMap) {
  await fs.mkdir(path.dirname(issuesFile(projectPath)), { recursive: true });
  await fs.writeFile(issuesFile(projectPath), JSON.stringify(map, null, 2), "utf8");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ issues: await readRecords(project.path) });
}

interface Failure { testId: string; file: string; error?: string; baseURL?: string; runId?: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await resolveProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const conn = await getConnection(id);
  if (!conn) return NextResponse.json({ error: "No GitHub repo connected for this project" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const failures: Failure[] = Array.isArray(body.failures) ? body.failures : [];
  const addToBoard = body.addToBoard !== false && !!conn.boardId;
  if (failures.length === 0) return NextResponse.json({ error: "No failures provided" }, { status: 400 });

  const records = await readRecords(project.path);
  const created: { testId: string; number: number; url: string; onBoard: boolean }[] = [];
  const errors: { testId: string; error: string }[] = [];

  for (const f of failures) {
    try {
      const title = `E2E failed: ${f.testId}`;
      const bodyMd = [
        `**Test:** \`${f.testId}\``,
        `**Spec:** \`${f.file}\``,
        f.baseURL ? `**Environment:** ${f.baseURL}` : "",
        f.runId ? `**Run:** ${f.runId}` : "",
        "",
        "```",
        (f.error || "Test failed").slice(0, 4000),
        "```",
        "",
        `_Filed automatically by Greenlight._`,
      ].filter(Boolean).join("\n");

      const issue = await createIssue(conn.owner, conn.repo, title, bodyMd);
      let onBoard = false;
      if (addToBoard && conn.boardId) {
        try { await addIssueToBoard(conn.boardId, issue.node_id); onBoard = true; } catch { onBoard = false; }
      }
      records[f.testId] = { number: issue.number, url: issue.html_url, createdAt: new Date().toISOString(), onBoard };
      created.push({ testId: f.testId, number: issue.number, url: issue.html_url, onBoard });
    } catch (err) {
      errors.push({ testId: f.testId, error: (err as Error).message });
    }
  }

  await writeRecords(project.path, records);
  return NextResponse.json({ created, errors, issues: records });
}
