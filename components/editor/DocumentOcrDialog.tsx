"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, FileScan, FileUp, Link as LinkIcon, Loader2, RotateCcw, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useJobCenter } from "@/components/jobs/JobCenter";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { normalizeMarkdownForWrite } from "@/lib/content-contract";
import { dialogMotion, overlayMotion, uiMotion } from "@/lib/motion";
import { deleteOcrDocument, generateFileName, uploadOcrDocument } from "@/lib/supabase-storage";

type SourceMode = "upload" | "url";
type OcrStage = "idle" | "submitting" | "waiting" | "complete" | "error";

interface DocumentOcrDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
}

type SubmitResponse = {
  success?: boolean;
  taskId?: unknown;
  fileName?: unknown;
  ledgerAvailability?: unknown;
  ledgerJob?: unknown;
  error?: unknown;
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function readApiJson<T extends { error?: unknown }>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok) {
    throw new Error(toString(payload.error) || fallback);
  }
  return payload;
}

function normalizeMarkdownForInsert(markdown: string) {
  return `\n\n${normalizeMarkdownForWrite(markdown, "ocr")}\n`;
}

function shouldUseTemporaryLink(file: File) {
  return file.size > DIRECT_UPLOAD_LIMIT_BYTES;
}

function isPayloadTooLargeResponse(response: Response) {
  return response.status === 413 || response.headers.get("x-vercel-error") === "FUNCTION_PAYLOAD_TOO_LARGE";
}

export function DocumentOcrDialog({ isOpen, onClose, onInsert }: DocumentOcrDialogProps) {
  const { jobs, createDocumentOcrJob, loadJobResult, claimJobResult } = useJobCenter();
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [stage, setStage] = useState<OcrStage>("idle");
  const [taskId, setTaskId] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const temporaryOcrPathRef = useRef<string | null>(null);
  const autoRestoreJobRef = useRef<string | null>(null);
  const resumableJob = taskId
    ? undefined
    : jobs.find((job) => (
      job.type === "document_ocr"
      && (job.status === "queued" || job.status === "running" || (job.status === "succeeded" && !job.resultClaimedAt))
    ));
  const effectiveTaskId = taskId || resumableJob?.id || "";
  const currentJob = jobs.find((job) => job.id === effectiveTaskId);
  const visibleStage: OcrStage = currentJob
    ? currentJob.status === "succeeded"
      ? "complete"
      : currentJob.status === "failed"
        ? "error"
        : "waiting"
    : stage;
  const visibleMarkdown = currentJob?.resultMarkdown ?? markdown;
  const visibleStatusText = currentJob?.statusText ?? statusText;
  const visibleError = currentJob?.error ?? error;
  const visiblePollCount = currentJob?.pollCount ?? pollCount;

  const isBusy = stage === "submitting";
  const canSubmit = sourceMode === "upload" ? Boolean(file) : Boolean(fileUrl.trim());

  useEffect(() => {
    if (!isOpen) {
      autoRestoreJobRef.current = null;
      return;
    }
    if (
      currentJob?.status === "succeeded"
      && !currentJob.resultMarkdown
      && currentJob.remoteJobId
      && autoRestoreJobRef.current !== currentJob.id
    ) {
      autoRestoreJobRef.current = currentJob.id;
      void loadJobResult(currentJob.id);
    }
  }, [currentJob, isOpen, loadJobResult]);

  const cleanupTemporaryOcrFile = async () => {
    const path = temporaryOcrPathRef.current;
    if (!path) return;

    temporaryOcrPathRef.current = null;
    try {
      await deleteOcrDocument(path);
    } catch (cleanupError) {
      console.warn("Failed to clean OCR temporary file:", cleanupError);
    }
  };

  const reset = () => {
    if (!currentJob) void cleanupTemporaryOcrFile();
    setStage("idle");
    setTaskId("__new__");
    setMarkdown("");
    setStatusText("");
    setError("");
    setPollCount(0);
  };

  const handleClose = () => {
    onClose();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setError("");
    setMarkdown("");
    setTaskId("__new__");
    setPollCount(0);
    setStage("idle");

    if (!nextFile) {
      setFile(null);
      return;
    }

    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (nextFile.type !== "application/pdf" && extension !== "pdf") {
      setFile(null);
      setError("当前入口只接收 PDF 讲义");
      event.target.value = "";
      return;
    }

    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError("上传文件超过 50MB，请改用文件 URL 方式提交");
      event.target.value = "";
      return;
    }

    setFile(nextFile);
    setFileName(nextFile.name);
  };

  const submitUrlSource = async (url: string, submittedFileName: string, sourcePath?: string) => {
    return fetch("/api/ai/document-ocr", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileUrl: url,
        fileName: submittedFileName,
        sourcePath,
      }),
    });
  };

  const submitFileDirectly = async (selectedFile: File) => {
    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set("fileName", selectedFile.name);

    return fetch("/api/ai/document-ocr", {
      method: "POST",
      headers: await buildAuthHeaders(),
      body: formData,
    });
  };

  const submitFileByTemporaryLink = async (selectedFile: File, message: string) => {
    setStatusText(message);
    const uploaded = await uploadOcrDocument(selectedFile, generateFileName("ocr-temp", "pdf"));
    temporaryOcrPathRef.current = uploaded.path;
    setStatusText("临时文件链接已生成，正在提交百度 OCR 任务");
    return submitUrlSource(uploaded.url, selectedFile.name, uploaded.path);
  };

  const submitUploadedFile = async (selectedFile: File) => {
    if (shouldUseTemporaryLink(selectedFile)) {
      return submitFileByTemporaryLink(
        selectedFile,
        "文件较大，正在自动创建临时文件链接",
      );
    }

    const response = await submitFileDirectly(selectedFile);
    if (isPayloadTooLargeResponse(response)) {
      return submitFileByTemporaryLink(
        selectedFile,
        "直传被平台限制，正在自动改用临时文件链接",
      );
    }

    return response;
  };

  const handleSubmit = async () => {
    if (isBusy || !canSubmit) return;

    setStage("submitting");
    setMarkdown("");
    setTaskId("");
    setError("");
    setPollCount(0);
    setStatusText("正在提交百度 OCR 任务");

    try {
      void cleanupTemporaryOcrFile();
      let response: Response;

      if (sourceMode === "upload") {
        if (!file) throw new Error("请选择 PDF 文件");
        response = await submitUploadedFile(file);
      } else {
        response = await submitUrlSource(fileUrl.trim(), fileName.trim() || "lecture.pdf");
      }

      const payload = await readApiJson<SubmitResponse>(response, "讲义 OCR 任务提交失败");
      const nextTaskId = toString(payload.taskId);
      if (!nextTaskId) throw new Error("百度 OCR 没有返回任务 ID");
      const job = createDocumentOcrJob({
        externalTaskId: nextTaskId,
        fileName: fileName.trim() || file?.name || toString(payload.fileName) || "PDF 讲义 OCR",
        sourcePath: temporaryOcrPathRef.current ?? undefined,
        ledgerAvailability: toString(payload.ledgerAvailability),
        ledgerJob: payload.ledgerJob,
      });
      temporaryOcrPathRef.current = null;
      setTaskId(job.id);
      setStage("waiting");
      setStatusText("任务已保存到任务中心，可安全关闭或切换页面");
    } catch (submitError: unknown) {
      void cleanupTemporaryOcrFile();
      setStage("error");
      setError(getErrorMessage(submitError, "讲义 OCR 失败"));
      setStatusText("");
    }
  };

  const handleInsert = () => {
    if (!visibleMarkdown.trim()) return;
    onInsert(normalizeMarkdownForInsert(visibleMarkdown));
    if (effectiveTaskId) claimJobResult(effectiveTaskId);
    reset();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        variants={overlayMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: uiMotion.duration.fast, ease: uiMotion.ease.standard }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          variants={dialogMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={uiMotion.spring.gentle}
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-elevated"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="PDF 讲义 OCR"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
            <h2 className="flex items-center gap-2 font-headline text-lg font-bold text-on-surface">
              <FileScan className="h-5 w-5 text-primary" />
              PDF 讲义 OCR
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="motion-ui motion-interactive flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-high"
              title={visibleStage === "waiting" ? "关闭（任务继续运行）" : "关闭"}
              aria-label={visibleStage === "waiting" ? "关闭，任务继续运行" : "关闭"}
            >
              <X className="h-5 w-5 text-on-surface-variant" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-outline-variant/15 bg-surface-container-low p-1">
              <button
                type="button"
                onClick={() => {
                  if (isBusy) return;
                  setSourceMode("upload");
                  reset();
                }}
                className={`control-button h-10 min-h-0 text-sm ${sourceMode === "upload" ? "control-button-primary" : ""}`}
              >
                <FileUp className="h-4 w-4" />
                上传 PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isBusy) return;
                  setSourceMode("url");
                  reset();
                }}
                className={`control-button h-10 min-h-0 text-sm ${sourceMode === "url" ? "control-button-primary" : ""}`}
              >
                <LinkIcon className="h-4 w-4" />
                文件链接
              </button>
            </div>

            {sourceMode === "upload" ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="motion-ui motion-interactive flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-outline-variant/35 bg-surface-container-low px-4 py-8 text-center hover:border-primary/45 hover:bg-primary/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileUp className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-on-surface">
                  {file ? file.name : "选择 PDF 讲义"}
                </span>
                <span className="text-xs text-on-surface-variant/60">
                  {file ? formatFileSize(file.size) : "PDF · ≤ 50MB"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-on-surface-variant">PDF 文件链接</label>
                  <input
                    type="url"
                    value={fileUrl}
                    onChange={(event) => setFileUrl(event.target.value)}
                    disabled={isBusy}
                    placeholder="https://..."
                    className="field-control h-11 w-full px-4 text-sm placeholder:text-on-surface-variant/40"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-on-surface-variant">文件名</label>
                  <input
                    type="text"
                    value={fileName}
                    onChange={(event) => setFileName(event.target.value)}
                    disabled={isBusy}
                    placeholder="lecture.pdf"
                    className="field-control h-11 w-full px-4 text-sm placeholder:text-on-surface-variant/40"
                  />
                </div>
              </div>
            )}

            {visibleStage !== "idle" && (
              <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
                <div className="flex items-center gap-3">
                  {visibleStage === "complete" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-700" />
                  ) : visibleStage === "error" ? (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface">
                      {visibleStage === "error" ? "解析失败" : visibleStage === "complete" ? "解析完成" : visibleStatusText || "正在处理"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-variant/60">
                      {currentJob?.externalTaskId ? `外部任务：${currentJob.externalTaskId}` : "等待任务 ID"}
                      {visiblePollCount > 0 ? ` · 第 ${visiblePollCount} 次查询` : ""}
                    </p>
                  </div>
                </div>
                {visibleError && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{visibleError}</p>
                )}
              </div>
            )}

            {visibleMarkdown && (
              <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant/15">
                <div className="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low px-4 py-2">
                  <span className="text-sm font-medium text-on-surface">Markdown 预览</span>
                  <span className="text-xs text-on-surface-variant/60">{visibleMarkdown.length.toLocaleString()} 字符</span>
                </div>
                <div className="max-h-[42vh] overflow-y-auto bg-surface-container-lowest p-4">
                  <MarkdownContent content={visibleMarkdown} className="text-sm text-on-surface" />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/10 px-5 py-4">
            <button
              type="button"
              onClick={reset}
              disabled={isBusy}
              className="control-button h-10 px-3 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="control-button h-10 px-4 text-sm"
              >
                关闭
              </button>
              {visibleStage === "complete" ? (
                <button
                  type="button"
                  onClick={handleInsert}
                  className="control-button control-button-primary h-10 px-4 text-sm"
                >
                  插入正文
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isBusy || !canSubmit}
                  className="control-button control-button-primary h-10 px-4 text-sm"
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileScan className="h-4 w-4" />}
                  {isBusy ? "正在提交" : visibleStage === "waiting" ? "新建另一个任务" : "开始 OCR"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
