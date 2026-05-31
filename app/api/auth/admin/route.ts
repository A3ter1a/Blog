import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/server-admin-auth";

export async function GET(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return adminError;

  return NextResponse.json({ success: true, isAdmin: true });
}
