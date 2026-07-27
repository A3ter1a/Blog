import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { createPrivateBooklet, getMathTrainingPersistenceMode } from "@/lib/server-math-training-core";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSourceRefs(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return [];
  return value.flatMap((item): Array<Record<string, unknown>> => {
    const record = asRecord(item);
    const sourceNoteId = typeof record.sourceNoteId === "string" ? record.sourceNoteId.trim() : "";
    const sourceProblemId = typeof record.sourceProblemId === "string" ? record.sourceProblemId.trim().slice(0, 200) : "";
    const checksum = typeof record.checksum === "string" ? record.checksum.trim() : "";
    const sourceContentVersion = Number(record.sourceContentVersion);
    if (!UUID_PATTERN.test(sourceNoteId) || !sourceProblemId || !CHECKSUM_PATTERN.test(checksum)
      || !Number.isInteger(sourceContentVersion) || sourceContentVersion < 1) return [];
    return [{ sourceNoteId, sourceProblemId, sourceContentVersion, checksum }];
  });
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;
    if (getMathTrainingPersistenceMode() !== "shared") {
      return NextResponse.json({ error: "做题本共享元数据尚未启用" }, { status: 409 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const content = typeof body.content === "string" ? body.content : "";
    const ruleVersion = typeof body.ruleVersion === "string" ? body.ruleVersion.trim().slice(0, 100) : "";
    const snapshotChecksum = typeof body.snapshotChecksum === "string" ? body.snapshotChecksum.trim() : "";
    const sourceRefs = normalizeSourceRefs(body.sourceRefs);
    if (!UUID_PATTERN.test(commandId) || !title || !content || !ruleVersion || !CHECKSUM_PATTERN.test(snapshotChecksum)
      || sourceRefs.length !== (Array.isArray(body.sourceRefs) ? body.sourceRefs.length : -1)) {
      return NextResponse.json({ error: "做题本命令缺少有效标题、正文、来源版本或 checksum" }, { status: 400 });
    }
    const result = await createPrivateBooklet(admin.context.supabase, {
      commandId,
      title,
      content,
      sourceRefs,
      ruleVersion,
      snapshotChecksum,
      methodSummaryConfirmed: body.methodSummaryConfirmed === true,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "三刷做题本创建失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
