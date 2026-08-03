import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildMonthlyPlanningSnapshot,
  computePlanningEtag,
  DEFAULT_PLANNING_CYCLE_ID,
  getPlanningCycle,
  isPlanningMonthKey,
} from "@/lib/planning-monthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOW_METHODS = "GET, OPTIONS";
const ALLOW_HEADERS = "Authorization, If-None-Match, Content-Type";

type CorsContext = {
  origin: string | null;
  allowed: boolean;
};

function getAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.BLOG_PLANNING_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function getCorsContext(req: NextRequest): CorsContext {
  const origin = req.headers.get("origin")?.trim() || null;
  if (!origin) return { origin: null, allowed: true };

  return {
    origin,
    allowed: getAllowedOrigins().has(origin),
  };
}

function createBaseHeaders(cors: CorsContext): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  });

  if (cors.origin && cors.allowed) {
    headers.set("Access-Control-Allow-Origin", cors.origin);
  }

  return headers;
}

function errorResponse(
  req: NextRequest,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  const cors = getCorsContext(req);
  const headers = createBaseHeaders(cors);
  headers.set("Cache-Control", "no-store");

  if (status === 401) {
    headers.set("WWW-Authenticate", 'Bearer realm="blog-planning"');
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status, headers },
  );
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function tokensMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function authorize(req: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expectedToken = process.env.BLOG_PLANNING_READ_TOKEN;
  if (!expectedToken) {
    return {
      ok: false,
      response: errorResponse(req, 503, "planning_read_token_not_configured", "只读规划接口尚未配置访问凭据。"),
    };
  }

  const providedToken = getBearerToken(req);
  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    return {
      ok: false,
      response: errorResponse(req, 401, "invalid_planning_credentials", "需要有效的只读规划访问凭据。"),
    };
  }

  return { ok: true };
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;

  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag || value === `W/${etag}`);
}

export function OPTIONS(req: NextRequest): NextResponse {
  const cors = getCorsContext(req);
  if (!cors.allowed) {
    return errorResponse(req, 403, "cors_origin_not_allowed", "当前来源未被允许访问只读规划接口。", {
      origin: cors.origin,
    });
  }

  const headers = createBaseHeaders(cors);
  headers.set("Cache-Control", "no-store");
  return new NextResponse(null, { status: 204, headers });
}

export function GET(req: NextRequest): NextResponse {
  const cors = getCorsContext(req);
  if (!cors.allowed) {
    return errorResponse(req, 403, "cors_origin_not_allowed", "当前来源未被允许访问只读规划接口。", {
      origin: cors.origin,
    });
  }

  const authorization = authorize(req);
  if (!authorization.ok) return authorization.response;

  const cycleId = req.nextUrl.searchParams.get("cycle")?.trim() || DEFAULT_PLANNING_CYCLE_ID;
  const cycle = getPlanningCycle(cycleId);
  if (!cycle) {
    return errorResponse(req, 404, "planning_cycle_not_found", "备考周期不存在。", {
      cycle: cycleId,
    });
  }

  const month = req.nextUrl.searchParams.get("month")?.trim() || "";
  if (!month || !isPlanningMonthKey(month)) {
    return errorResponse(req, 400, "invalid_month", "month 必须是 YYYY-MM 格式。", {
      month: month || null,
    });
  }

  if (!cycle.planningMonths.includes(month)) {
    return errorResponse(req, 404, "planning_month_not_found", "该月份不在备考周期的规划范围内。", {
      cycle: cycle.id,
      month,
      availableMonths: cycle.planningMonths,
    });
  }

  const data = buildMonthlyPlanningSnapshot(cycle.id, month);
  const etag = computePlanningEtag(data);
  const headers = createBaseHeaders(cors);
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set("ETag", etag);
  headers.set("X-Planning-Schema-Version", String(data.schemaVersion));

  if (matchesEtag(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json({ success: true, data }, { status: 200, headers });
}
