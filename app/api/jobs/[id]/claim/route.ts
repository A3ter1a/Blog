import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { claimSucceededJob } from "@/lib/server-job-ledger";

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
    const ledger = await claimSucceededJob(auth.context.supabase, auth.context.user.id, id);
    if (ledger.availability !== "synced") {
      return NextResponse.json({
        error: "任务账本尚未迁移，当前结果只保存在本机",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    if (!ledger.data) {
      return NextResponse.json({ error: "只有尚未领取的已完成任务可以领取", success: false }, { status: 409 });
    }
    return NextResponse.json({ success: true, job: ledger.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "任务结果领取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
