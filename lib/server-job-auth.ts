import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAuthenticatedServerClient, getBearerToken } from "./server-admin-auth";

export type JobRequestContext = {
  supabase: ReturnType<typeof createAuthenticatedServerClient>;
  user: User;
};

export type JobRequestContextResult =
  | { ok: true; context: JobRequestContext }
  | { ok: false; response: NextResponse };

/** Jobs are protected by owner RLS, so both administrators and AI accounts can
 * operate only their own durable task rows. Creation routes still enforce the
 * role required by the underlying feature. */
export async function getJobRequestContext(req: NextRequest): Promise<JobRequestContextResult> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "登录后才能访问任务中心", success: false }, { status: 401 }) };
  }
  let supabase;
  try {
    supabase = createAuthenticatedServerClient(req);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Supabase server config is missing", success: false }, { status: 500 }) };
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "登录会话无效", success: false }, { status: 401 }) };
  }
  return { ok: true, context: { supabase, user: data.user } };
}
