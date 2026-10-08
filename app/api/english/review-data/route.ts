import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

/** Local review reads the prepared complete import, never the demo fixture. */
export async function GET(request: NextRequest) {
  const enabled = process.env.NEXT_PUBLIC_ASTEROID_REVIEW_MODE === "1";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname);
  if (!enabled || !local || process.env.VERCEL) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const data = JSON.parse(await readFile(join(process.cwd(), "data/english-papers/english1-2021-2026.json"), "utf8"));
    return NextResponse.json({ ...data, reviewAuditStatus: "pending" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "六年完整真题数据尚未完成核验" }, { status: 503 });
  }
}
