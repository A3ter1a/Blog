import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getServerAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isServerAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getServerAdminEmails().includes(email.trim().toLowerCase());
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireAdminRequest(req: NextRequest): Promise<NextResponse | null> {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "需要管理员登录", success: false }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase 服务端配置缺失", success: false }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "登录状态无效", success: false }, { status: 401 });
  }

  if (!isServerAdminEmail(data.user.email)) {
    return NextResponse.json({ error: "没有管理员权限", success: false }, { status: 403 });
  }

  return null;
}

export function resolveAIKey(provider: "deepseek" | "qwen", clientApiKey?: unknown): string {
  const envKey = provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : process.env.QWEN_API_KEY;
  if (envKey) return envKey;

  if (process.env.NODE_ENV !== "production" && typeof clientApiKey === "string") {
    return clientApiKey.trim();
  }

  return "";
}
