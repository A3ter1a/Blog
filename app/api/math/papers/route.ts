import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { getMathTrainingPersistenceMode, listMathPapers } from "@/lib/server-math-training-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminRequestContext(req);
  if (!admin.ok) return admin.response;
  try {
    const mode = getMathTrainingPersistenceMode();
    if (mode === "local") {
      return NextResponse.json({ mode, available: false, papers: [] }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const papers = await listMathPapers(admin.context.supabase);
    return NextResponse.json({ mode, available: true, papers }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数学真题列表读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
