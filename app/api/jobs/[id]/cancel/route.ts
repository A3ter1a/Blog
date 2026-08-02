import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { cancelUserJob, sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "任务 ID 无效", success: false }, { status: 400 });
  }

  try {
    const ledger = await cancelUserJob(auth.context.supabase, auth.context.user.id, id);
    if (ledger.availability !== "synced") {
      return NextResponse.json({
        error: "任务账本尚未迁移，当前只能在本机停止任务跟踪",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    if (!ledger.data) {
      return NextResponse.json({ error: "任务不存在、无权访问或已经进入终态", success: false }, { status: 409 });
    }
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "任务取消失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
