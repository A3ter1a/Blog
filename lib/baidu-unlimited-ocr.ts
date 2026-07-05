const BAIDU_TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const BAIDU_UNLIMITED_OCR_TASK_URL = "https://aip.baidubce.com/rest/2.0/brain/online/v2/unlimited-ocr-parser/task";
const BAIDU_UNLIMITED_OCR_QUERY_URL = "https://aip.baidubce.com/rest/2.0/brain/online/v2/unlimited-ocr-parser/task/query";

type BaiduAccessTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type BaiduResponse = {
  error_code?: unknown;
  error_msg?: unknown;
  result?: unknown;
};

type BaiduTaskResult = {
  task_id?: unknown;
  status?: unknown;
  task_error?: unknown;
  markdown_url?: unknown;
  parse_result_url?: unknown;
};

export type BaiduOcrSource =
  | {
      fileData: string;
      fileName: string;
    }
  | {
      fileUrl: string;
      fileName: string;
    };

export type BaiduOcrTaskStatus = {
  taskId: string;
  status: "pending" | "running" | "success" | "failed" | "unknown";
  taskError?: string;
  markdownUrl?: string;
  parseResultUrl?: string;
  markdown?: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function getBaiduCredentials() {
  const apiKey = process.env.BAIDU_OCR_API_KEY || process.env.BAIDU_API_KEY || "";
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY || process.env.BAIDU_SECRET_KEY || "";
  return { apiKey: apiKey.trim(), secretKey: secretKey.trim() };
}

export function hasBaiduOcrCredentials() {
  const { apiKey, secretKey } = getBaiduCredentials();
  return Boolean(apiKey && secretKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function getBaiduErrorMessage(payload: BaiduResponse, fallback: string) {
  const errorCode = toString(payload.error_code);
  const errorMessage = toString(payload.error_msg);
  if (errorCode && errorCode !== "0") {
    return errorMessage ? `${errorMessage}（${errorCode}）` : `${fallback}（${errorCode}）`;
  }
  return errorMessage || fallback;
}

function assertBaiduSuccess(payload: BaiduResponse, fallback: string) {
  const errorCode = toString(payload.error_code);
  if (errorCode && errorCode !== "0") {
    throw new Error(getBaiduErrorMessage(payload, fallback));
  }
}

function getResult(payload: BaiduResponse): BaiduTaskResult {
  return isRecord(payload.result) ? payload.result : {};
}

function normalizeStatus(value: unknown): BaiduOcrTaskStatus["status"] {
  const status = toString(value).toLowerCase();
  if (status === "pending" || status === "running" || status === "success" || status === "failed") {
    return status;
  }
  return "unknown";
}

function stripTags(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlTableToMarkdown(table: string) {
  const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (rowMatch) => {
    return Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (cellMatch) => (
      escapeMarkdownTableCell(decodeHtml(stripTags(cellMatch[1])))
    )).filter((cell) => cell.length > 0);
  }).filter((row) => row.length > 0);

  if (rows.length === 0) return "";

  const width = Math.max(...rows.map((row) => row.length));
  const normalizeRow = (row: string[]) => [...row, ...Array.from({ length: width - row.length }, () => "")];
  const [head, ...body] = rows.map(normalizeRow);
  const separator = Array.from({ length: width }, () => "---");
  const markdownRows = [head, separator, ...body].map((row) => `| ${row.join(" | ")} |`);
  return `\n\n${markdownRows.join("\n")}\n\n`;
}

export function normalizeBaiduMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<table\b[\s\S]*?<\/table>/gi, (table) => htmlTableToMarkdown(table))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function getBaiduAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const { apiKey, secretKey } = getBaiduCredentials();
  if (!apiKey || !secretKey) {
    throw new Error("缺少百度 OCR 密钥，请在服务端环境变量配置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY。");
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: secretKey,
  });
  const res = await fetch(`${BAIDU_TOKEN_URL}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({})) as BaiduAccessTokenResponse;
  const accessToken = toString(payload.access_token);

  if (!res.ok || !accessToken) {
    const message = toString(payload.error_description) || toString(payload.error) || "百度 Access Token 获取失败";
    throw new Error(message);
  }

  const expiresInSeconds = Number(payload.expires_in);
  const ttl = Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 20 * 24 * 60 * 60 * 1000;
  cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + Math.max(60_000, ttl - 10 * 60 * 1000),
  };
  return accessToken;
}

export async function createBaiduOcrTask(source: BaiduOcrSource): Promise<string> {
  const accessToken = await getBaiduAccessToken();
  const body = new URLSearchParams();
  body.set("file_name", source.fileName);

  if ("fileData" in source) {
    body.set("file_data", source.fileData);
  } else {
    body.set("file_url", source.fileUrl);
  }

  const res = await fetch(`${BAIDU_UNLIMITED_OCR_TASK_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({})) as BaiduResponse;

  if (!res.ok) {
    throw new Error(getBaiduErrorMessage(payload, "百度 OCR 任务提交失败"));
  }
  assertBaiduSuccess(payload, "百度 OCR 任务提交失败");

  const taskId = toString(getResult(payload).task_id);
  if (!taskId) throw new Error("百度 OCR 没有返回 task_id");
  return taskId;
}

export async function queryBaiduOcrTask(taskId: string): Promise<BaiduOcrTaskStatus> {
  const accessToken = await getBaiduAccessToken();
  const body = new URLSearchParams({ task_id: taskId });
  const res = await fetch(`${BAIDU_UNLIMITED_OCR_QUERY_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({})) as BaiduResponse;

  if (!res.ok) {
    throw new Error(getBaiduErrorMessage(payload, "百度 OCR 任务查询失败"));
  }
  assertBaiduSuccess(payload, "百度 OCR 任务查询失败");

  const result = getResult(payload);
  const markdownUrl = toString(result.markdown_url);
  let markdown = "";

  if (normalizeStatus(result.status) === "success" && markdownUrl) {
    const markdownRes = await fetch(markdownUrl, { method: "GET", cache: "no-store" });
    if (markdownRes.ok) {
      markdown = normalizeBaiduMarkdown(await markdownRes.text());
    }
  }

  return {
    taskId: toString(result.task_id) || taskId,
    status: normalizeStatus(result.status),
    taskError: toString(result.task_error) || undefined,
    markdownUrl: markdownUrl || undefined,
    parseResultUrl: toString(result.parse_result_url) || undefined,
    markdown: markdown || undefined,
  };
}
