import { NextRequest, NextResponse } from "next/server";
import {
  decideAssistantMemoryServer,
  listAssistantMemories,
  proposeAssistantMemory,
} from "@/lib/server-assistant-memory";
import { getAdminRequestContext } from "@/lib/server-admin-auth";

export const runtime = "nodejs";

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ memories: await listAssistantMemories(auth.context.supabase), success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "记忆读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const action = record.action;
    if (action === "propose") {
      const commandId = text(record.commandId, 80);
      const content = text(record.content, 1000);
      const reason = text(record.reason, 240);
      const sourcePath = text(record.sourcePath, 500);
      if (!isUuid(commandId) || !content || !reason || !sourcePath.startsWith("/")) {
        return NextResponse.json({ error: "记忆候选参数无效", success: false }, { status: 400 });
      }
      const memory = await proposeAssistantMemory(auth.context.supabase, { commandId, content, reason, sourcePath });
      return NextResponse.json({ memory, success: true });
    }
    if (action === "decide") {
      const candidateId = text(record.candidateId, 80);
      const decision = record.decision === "accepted" || record.decision === "rejected" ? record.decision : null;
      if (!isUuid(candidateId) || !decision) {
        return NextResponse.json({ error: "记忆确认参数无效", success: false }, { status: 400 });
      }
      const memory = await decideAssistantMemoryServer(auth.context.supabase, { candidateId, decision });
      return NextResponse.json({ memory, success: true });
    }
    return NextResponse.json({ error: "不支持的记忆操作", success: false }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "记忆操作失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
