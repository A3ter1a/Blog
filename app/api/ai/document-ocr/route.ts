import { NextRequest, NextResponse } from "next/server";
import { createBaiduOcrTask, queryBaiduOcrTask } from "@/lib/baidu-unlimited-ocr";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  normalizeOcrSourcePath,
  persistExternalOcrStatus,
  registerExternalOcrJob,
} from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SUPPORTED_UPLOAD_EXTENSIONS = new Set(["pdf"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function getExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function normalizeFileName(value: unknown, fallback: string) {
  const name = toString(value).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return name || fallback;
}

function isTaskId(value: string) {
  return /^task-[A-Za-z0-9_-]{8,160}$/.test(value);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message, success: false }, { status });
}

async function parseSubmitSource(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const fileUrl = toString(formData.get("fileUrl"));
    const submittedFileName = normalizeFileName(formData.get("fileName"), "lecture.pdf");

    if (fileUrl) {
      return {
        fileUrl,
        fileName: submittedFileName,
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("请选择一个 PDF 文件，或填写可公开访问的 PDF 文件链接");
    }

    const fileName = normalizeFileName(file.name, submittedFileName);
    const extension = getExtension(fileName);
    if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
      throw new Error("当前入口只接收 PDF 讲义");
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("上传文件超过 50MB，请改用文件 URL 方式提交");
    }

    const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { fileData, fileName };
  }

  const body: unknown = await req.json().catch(() => ({}));
  const raw = isRecord(body) ? body : {};
  const fileUrl = toString(raw.fileUrl);
  const fileName = normalizeFileName(raw.fileName, "lecture.pdf");
  const requestedSourcePath = toString(raw.sourcePath);
  const sourcePath = normalizeOcrSourcePath(requestedSourcePath);
  if (!fileUrl) {
    throw new Error("请填写可公开访问的 PDF 文件链接");
  }
  if (requestedSourcePath && !sourcePath) {
    throw new Error("OCR 临时文件路径无效");
  }

  return { fileUrl, fileName, sourcePath };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAdminRequestContext(req);
    if (!auth.ok) return auth.response;

    const source = await parseSubmitSource(req);
    const taskId = await createBaiduOcrTask(source);
    let ledgerAvailability: "synced" | "schema_pending" | "sync_failed" = "sync_failed";
    let ledgerJob = null;
    try {
      const ledger = await registerExternalOcrJob(auth.context.supabase, {
        userId: auth.context.user.id,
        taskId,
        title: source.fileName,
        sourcePath: "sourcePath" in source ? source.sourcePath : undefined,
      });
      ledgerAvailability = ledger.availability;
      ledgerJob = ledger.data;
    } catch (ledgerError: unknown) {
      console.error(
        "[DocumentOcrLedger] registration failed:",
        ledgerError instanceof Error ? ledgerError.message : "unknown error",
      );
    }

    return NextResponse.json({
      taskId,
      fileName: source.fileName,
      ledgerAvailability,
      ledgerJob,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "讲义 OCR 任务提交失败";
    return jsonError(message, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAdminRequestContext(req);
    if (!auth.ok) return auth.response;

    const taskId = req.nextUrl.searchParams.get("taskId")?.trim() || "";
    if (!taskId || !isTaskId(taskId)) {
      return jsonError("任务 ID 无效");
    }

    const result = await queryBaiduOcrTask(taskId);
    let ledgerAvailability: "synced" | "schema_pending" | "sync_failed" = "sync_failed";
    let ledgerJob = null;
    try {
      const ledger = await persistExternalOcrStatus(
        auth.context.supabase,
        auth.context.user.id,
        result,
      );
      ledgerAvailability = ledger.availability;
      ledgerJob = ledger.data;
    } catch (ledgerError: unknown) {
      console.error(
        "[DocumentOcrLedger] status persistence failed:",
        ledgerError instanceof Error ? ledgerError.message : "unknown error",
      );
    }
    return NextResponse.json({
      ...result,
      ledgerAvailability,
      ledgerJob,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "讲义 OCR 任务查询失败";
    return jsonError(message, 500);
  }
}
