import { NextRequest, NextResponse } from "next/server";
import { getJobRequestContext } from "@/lib/server-job-auth";
import { dismissTerminalUserJob } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getJobRequestContext(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "任务 ID 无效", success: false }, { status: 400 });
  }

  try {
    const ledger = await dismissTerminalUserJob(auth.context.supabase, auth.context.user.id, id);
    if (ledger.availability !== "synced") {
      return NextResponse.json({
        error: "任务账本尚未迁移，暂时无法移出云端历史",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    if (!ledger.data) {
      return NextResponse.json({
        error: "只有失败、已领取或已取消的任务可以移出历史",
        success: false,
      }, { status: 409 });
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "任务移出历史失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
