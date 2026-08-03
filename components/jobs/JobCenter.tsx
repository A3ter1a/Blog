"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleX, Clock3, FileScan, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AI_REVIEW_QUEUE_CHANGED_EVENT } from "@/lib/ai-content-contract";
import {
  CLIENT_JOB_STORAGE_KEY,
  canRetryClientJob,
  getClientJobProgressLabel,
  isClientJobActive,
  mergeClientJobLedgers,
  normalizeRemoteJobResult,
  normalizeRemoteJobRows,
  normalizeStoredJobs,
  prepareClientJobsForStorage,
  removeExpiredClientJobs,
  type ClientJob,
} from "@/lib/job-client";
import {
  deleteOcrDocument,
  deleteProblemOcrAssets,
  uploadProblemOcrAssets,
  type ProblemOcrUploadInput,
} from "@/lib/supabase-storage";
import type { ProblemOcrChapterContextItem } from "@/lib/problem-ocr-contract";

type CreateDocumentOcrJobInput = {
  externalTaskId: string;
  fileName: string;
  sourcePath?: string;
  ledgerAvailability?: string;
  ledgerJob?: unknown;
};

type CreateMarkdownReviewJobInput = {
  markdown: string;
  model: string;
};

type CreateProblemOcrJobInput = {
  images: ProblemOcrUploadInput[];
  chapterContext: ProblemOcrChapterContextItem[];
  qwenModel: string;
  deepseekModel: string;
};

type JobCenterContextValue = {
  jobs: ClientJob[];
  createDocumentOcrJob: (input: CreateDocumentOcrJobInput) => ClientJob;
  createMarkdownReviewJob: (input: CreateMarkdownReviewJobInput) => Promise<ClientJob | null>;
  createProblemOcrJob: (input: CreateProblemOcrJobInput) => Promise<ClientJob | null>;
  createLocalProblemOcrJob: (title: string) => ClientJob;
  createBatchGradeJob: (title: string) => ClientJob;
  updateJob: (id: string, patch: Partial<ClientJob>) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  loadJobResult: (id: string) => Promise<void>;
  claimJobResult: (id: string) => void;
  dismissJob: (id: string) => void;
};

type DocumentOcrStatusResponse = {
  status?: unknown;
  taskError?: unknown;
  markdown?: unknown;
  ledgerJob?: unknown;
  error?: unknown;
};

type JobLedgerListResponse = {
  jobs?: unknown;
};

type JobMutationResponse = {
  job?: unknown;
  error?: unknown;
  availability?: unknown;
  available?: unknown;
};

type PendingReviewNotice = {
  id: string;
  title: string;
  subject: string;
  authorName: string;
  contentVersion: number;
  updatedAt: string;
};

const JobCenterContext = createContext<JobCenterContextValue | null>(null);
const POLL_INTERVAL_MS = 6000;
const AUTH_RETRY_BACKOFF_MS = 30_000;
const MAX_HISTORY = 40;

type JobBucket = "pending" | "running" | "completed";

function getJobBucket(job: ClientJob): JobBucket {
  if (job.status === "running") return "running";
  if (job.status === "queued" || job.status === "waiting_for_trigger") return "pending";
  return "completed";
}

function getJobBucketLabel(bucket: JobBucket): string {
  if (bucket === "pending") return "待处理";
  if (bucket === "running") return "进行中";
  return "已完成";
}

function getJobStatusLabel(job: ClientJob): string {
  if (job.status === "failed") return "失败";
  if (job.status === "cancelled") return "已取消";
  if (job.status === "succeeded" || job.status === "claimed") return "已完成";
  if (job.status === "running") return "进行中";
  return "待处理";
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function createJobId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withBrowserJobLock(jobId: string, task: () => Promise<void>): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(`asteroid-job:${jobId}`, { ifAvailable: true }, async (lock) => {
      if (lock) await task();
    });
    return;
  }

  await task();
}

async function fetchRemoteJobLedger(): Promise<ClientJob[]> {
  const headers = await buildAuthHeaders();
  if (!headers.has("Authorization")) return [];
  const response = await fetch("/api/jobs?limit=40", { headers, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({})) as JobLedgerListResponse;
  return normalizeRemoteJobRows(payload.jobs);
}

async function fetchPendingReviewNotices(): Promise<PendingReviewNotice[]> {
  const headers = await buildAuthHeaders();
  if (!headers.has("Authorization")) return [];
  const response = await fetch("/api/ai/content-review?status=pending_review&limit=40", {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({})) as { proposals?: unknown };
  if (!Array.isArray(payload.proposals)) return [];

  return payload.proposals.flatMap((item): PendingReviewNotice[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const proposal = record.proposal && typeof record.proposal === "object" && !Array.isArray(record.proposal)
      ? record.proposal as Record<string, unknown>
      : null;
    const profile = record.profile && typeof record.profile === "object" && !Array.isArray(record.profile)
      ? record.profile as Record<string, unknown>
      : null;
    if (
      !proposal
      || proposal.review_status !== "pending_review"
      || typeof proposal.id !== "string"
      || typeof proposal.title !== "string"
      || typeof proposal.updated_at !== "string"
    ) return [];
    return [{
      id: proposal.id,
      title: proposal.title,
      subject: typeof proposal.subject === "string" ? proposal.subject : "",
      authorName: typeof profile?.display_name === "string" ? profile.display_name : "AI 学科账号",
      contentVersion: typeof proposal.content_version === "number" ? proposal.content_version : 1,
      updatedAt: proposal.updated_at,
    }];
  });
}

function getReviewSubjectLabel(subject: string): string {
  if (subject === "math") return "数学";
  if (subject === "english") return "英语";
  if (subject === "politics") return "政治";
  if (subject === "economics") return "经济学";
  return "未分类";
}

export function JobCenterProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAdmin } = useAdminAuth();
  const isUiLab = pathname.startsWith("/ui-lab/");
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [reviewNotices, setReviewNotices] = useState<PendingReviewNotice[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeBucket, setActiveBucket] = useState<JobBucket>("pending");
  const hydratedRef = useRef(false);
  const jobsRef = useRef<ClientJob[]>([]);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pollingRef = useRef(new Set<string>());
  const cancelledRef = useRef(new Set<string>());
  const resultLoadingRef = useRef(new Set<string>());
  const authRetryAfterRef = useRef(new Map<string, number>());

  const refreshReviewNotices = useCallback(() => {
    if (!isAdmin || isUiLab) {
      setReviewNotices([]);
      return;
    }
    void fetchPendingReviewNotices().then(setReviewNotices).catch(() => undefined);
  }, [isAdmin, isUiLab]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    if (isUiLab) {
      hydratedRef.current = true;
      return;
    }

    queueMicrotask(() => {
      try {
        const stored = removeExpiredClientJobs(
          normalizeStoredJobs(JSON.parse(localStorage.getItem(CLIENT_JOB_STORAGE_KEY) ?? "[]")),
        );
        const hydrated: ClientJob[] = stored.map((job) => (
          job.class === "internal" && isClientJobActive(job) && !job.remoteJobId
            ? {
              ...job,
              status: "failed" as const,
              phase: "需要重新开始",
              statusText: "浏览器刷新中断了本地图片处理，结果账本已保留",
              error: "本地图片未上传到持久任务存储，请重新选择原图后再试。",
              updatedAt: new Date().toISOString(),
            }
            : job
        ));
        setJobs(hydrated);
        void fetchRemoteJobLedger()
          .then((remoteJobs) => {
            if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
          })
          .catch(() => undefined);
      } catch {
        setJobs([]);
      } finally {
        hydratedRef.current = true;
      }
    });
  }, [isUiLab]);

  useEffect(() => {
    if (isUiLab) return;

    const cleanup = () => {
      setJobs((current) => removeExpiredClientJobs(current));
    };
    cleanup();
    const timer = window.setInterval(cleanup, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isUiLab]);

  useEffect(() => {
    if (isUiLab) return;

    const refresh = () => {
      authRetryAfterRef.current.clear();
      void fetchRemoteJobLedger()
        .then((remoteJobs) => {
          if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
        })
        .catch(() => undefined);
      refreshReviewNotices();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isUiLab, refreshReviewNotices]);

  useEffect(() => {
    const timer = window.setTimeout(refreshReviewNotices, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, refreshReviewNotices]);

  useEffect(() => {
    window.addEventListener(AI_REVIEW_QUEUE_CHANGED_EVENT, refreshReviewNotices);
    return () => window.removeEventListener(AI_REVIEW_QUEUE_CHANGED_EVENT, refreshReviewNotices);
  }, [refreshReviewNotices]);

  useEffect(() => {
    if (isUiLab) return;

    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        CLIENT_JOB_STORAGE_KEY,
        JSON.stringify(prepareClientJobsForStorage(jobs.slice(0, MAX_HISTORY))),
      );
    } catch {
      // 云端已同步结果不会重复塞进 localStorage；本机存储满时保留当前内存状态。
    }
  }, [isUiLab, jobs]);

  useEffect(() => {
    if (isUiLab) return;

    const sync = (event: StorageEvent) => {
      if (event.key !== CLIENT_JOB_STORAGE_KEY || !event.newValue) return;
      try {
        const stored = removeExpiredClientJobs(normalizeStoredJobs(JSON.parse(event.newValue)));
        setJobs((current) => mergeClientJobLedgers(
          stored,
          current.filter((job) => job.ledgerState === "synced"),
        ));
      } catch {
        // 忽略损坏的跨页缓存，当前页账本继续保留。
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [isUiLab]);

  const updateJob = useCallback((id: string, patch: Partial<ClientJob>) => {
    setJobs((current) => current.map((job) => (
      job.id === id
        ? { ...job, ...patch, updatedAt: new Date().toISOString() }
        : job
    )));
  }, []);

  const cleanupSource = useCallback(async (job: ClientJob) => {
    if (!job.sourcePath) return;
    try {
      await deleteOcrDocument(job.sourcePath);
    } catch (error: unknown) {
      if (cancelledRef.current.has(job.id)) return;
      updateJob(job.id, {
        cleanupError: error instanceof Error ? error.message : "临时文件清理失败",
      });
      return;
    }

    updateJob(job.id, { sourcePath: undefined, cleanupError: undefined });
    if (job.remoteJobId) {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(job.remoteJobId)}/source`, {
          method: "POST",
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("清理结果未同步到跨设备账本");
      } catch (error: unknown) {
        updateJob(job.id, {
          cleanupError: error instanceof Error ? error.message : "清理结果同步失败",
        });
      }
    }
  }, [updateJob]);

  const pollJob = useCallback(async (job: ClientJob) => {
    if (cancelledRef.current.has(job.id)) return;
    const canPollExternal = job.type === "document_ocr" && Boolean(job.externalTaskId);
    const canAdvanceInternal = job.class === "internal" && Boolean(job.remoteJobId);
    if ((!canPollExternal && !canAdvanceInternal) || pollingRef.current.has(job.id)) return;
    if ((authRetryAfterRef.current.get(job.id) ?? 0) > Date.now()) return;
    pollingRef.current.add(job.id);
    try {
      await withBrowserJobLock(job.remoteJobId ?? job.id, async () => {
        const authHeaders = await buildAuthHeaders();
        if (cancelledRef.current.has(job.id)) return;
        if (!authHeaders.has("Authorization")) {
          if (job.phase !== "等待登录恢复" || job.error) {
            updateJob(job.id, {
              status: "waiting_for_trigger",
              phase: "等待登录恢复",
              statusText: "登录后任务中心会继续推进，远端任务与临时源图仍保留",
              error: undefined,
            });
          }
          return;
        }

        if (canAdvanceInternal) {
          const response = await fetch(`/api/jobs/${encodeURIComponent(job.remoteJobId ?? "")}/advance`, {
            method: "POST",
            headers: authHeaders,
            cache: "no-store",
          });
          const payload = await response.json().catch(() => ({})) as JobMutationResponse;
          if (response.status === 401 || response.status === 403) {
            authRetryAfterRef.current.set(job.id, Date.now() + AUTH_RETRY_BACKOFF_MS);
            updateJob(job.id, {
              status: "waiting_for_trigger",
              phase: "等待登录恢复",
              statusText: "登录状态失效；重新登录后任务中心会继续推进",
              error: undefined,
            });
            return;
          }
          if (!response.ok) throw new Error(toText(payload.error) || "站内任务推进失败");
          if (cancelledRef.current.has(job.id)) return;
          authRetryAfterRef.current.delete(job.id);
          const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
          if (remoteJobs.length > 0) {
            setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
          }
          return;
        }

        const response = await fetch(`/api/ai/document-ocr?taskId=${encodeURIComponent(job.externalTaskId ?? "")}`, {
          headers: authHeaders,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as DocumentOcrStatusResponse;
        if (response.status === 401 || response.status === 403) {
          authRetryAfterRef.current.set(job.id, Date.now() + AUTH_RETRY_BACKOFF_MS);
          updateJob(job.id, {
            status: "waiting_for_trigger",
            phase: "等待登录恢复",
            statusText: "登录状态失效；重新登录后可继续查询讲义 OCR",
            error: undefined,
          });
          return;
        }
        if (!response.ok) throw new Error(toText(payload.error) || "讲义 OCR 任务查询失败");
        if (cancelledRef.current.has(job.id)) return;
        authRetryAfterRef.current.delete(job.id);
        const remoteJobs = normalizeRemoteJobRows(payload.ledgerJob ? [payload.ledgerJob] : []);
        if (remoteJobs.length > 0) {
          setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
        }

        const status = toText(payload.status);
        const heartbeatAt = new Date().toISOString();
        if (status === "success") {
          const markdown = toText(payload.markdown);
          if (!markdown) throw new Error("任务已完成，但没有返回 Markdown 结果");
          updateJob(job.id, {
            status: "succeeded",
            phase: "结果待领取",
            statusText: "解析完成，可在任务中心领取结果",
            resultMarkdown: markdown,
            heartbeatAt,
            pollCount: job.pollCount + 1,
            error: undefined,
          });
          await cleanupSource(job);
          return;
        }

        if (status === "failed") {
          updateJob(job.id, {
            status: "failed",
            phase: "解析失败",
            statusText: "百度 OCR 返回失败",
            error: toText(payload.taskError) || "百度 OCR 解析失败",
            heartbeatAt,
            pollCount: job.pollCount + 1,
          });
          await cleanupSource(job);
          return;
        }

        updateJob(job.id, {
          status: "running",
          phase: status === "running" ? "百度正在解析" : "任务排队中",
          statusText: status === "running" ? "外部平台正在解析讲义" : "已提交，等待外部平台开始处理",
          heartbeatAt,
          pollCount: job.pollCount + 1,
          error: undefined,
        });
      });
    } catch (error: unknown) {
      updateJob(job.id, {
        status: canAdvanceInternal ? "waiting_for_trigger" : "failed",
        phase: canAdvanceInternal ? "推进连接中断" : "查询中断",
        statusText: canAdvanceInternal
          ? "远端任务仍保留，任务中心稍后会继续推进"
          : "任务仍保留，可稍后重试查询",
        error: error instanceof Error ? error.message : "任务查询失败",
      });
    } finally {
      pollingRef.current.delete(job.id);
    }
  }, [cleanupSource, updateJob]);

  const activeJobPollKey = useMemo(
    () => jobs.filter(isClientJobActive).map((job) => job.id).sort().join("|"),
    [jobs],
  );

  useEffect(() => {
    if (isUiLab) return;
    if (!activeJobPollKey) return;

    const pollAll = () => jobsRef.current
      .filter(isClientJobActive)
      .forEach((job) => { void pollJob(job); });
    pollAll();
    const timer = window.setInterval(pollAll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeJobPollKey, isUiLab, pollJob]);

  const createDocumentOcrJob = useCallback((input: CreateDocumentOcrJobInput) => {
    const now = new Date().toISOString();
    const localJob: ClientJob = {
      id: createJobId(),
      type: "document_ocr",
      class: "external",
      provider: "baidu-unlimited-ocr",
      externalTaskId: input.externalTaskId,
      title: input.fileName || "PDF 讲义 OCR",
      status: "queued",
      phase: "任务排队中",
      statusText: input.ledgerAvailability === "synced"
        ? "任务已保存到跨设备账本，可安全关闭弹窗或切换页面"
        : "任务已保存到本机任务中心，可安全关闭弹窗或切换页面",
      createdAt: now,
      updatedAt: now,
      pollCount: 0,
      sourcePath: input.sourcePath,
      ledgerState: input.ledgerAvailability === "synced"
        ? "synced"
        : input.ledgerAvailability === "schema_pending"
          ? "schema_pending"
          : input.ledgerAvailability === "sync_failed"
            ? "sync_failed"
            : "local_only",
    };
    const remoteJobs = normalizeRemoteJobRows(input.ledgerJob ? [input.ledgerJob] : []);
    const job = remoteJobs.length > 0
      ? mergeClientJobLedgers([localJob], remoteJobs)[0]
      : localJob;
    setJobs((current) => [job, ...current].slice(0, MAX_HISTORY));
    return job;
  }, []);

  const createMarkdownReviewJob = useCallback(async (input: CreateMarkdownReviewJobInput) => {
    const response = await fetch("/api/jobs/markdown-review", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (response.status === 503 && payload.availability === "schema_pending") return null;
    if (!response.ok) throw new Error(toText(payload.error) || "Markdown 审阅任务创建失败");
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job) throw new Error("任务账本没有返回有效的 Markdown 审阅任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createProblemOcrJob = useCallback(async (input: CreateProblemOcrJobInput) => {
    const capabilityResponse = await fetch("/api/jobs/problem-ocr", {
      headers: await buildAuthHeaders(),
      cache: "no-store",
    });
    const capability = await capabilityResponse.json().catch(() => ({})) as JobMutationResponse;
    if (!capabilityResponse.ok) throw new Error(toText(capability.error) || "题库 OCR 持久任务能力检查失败");
    if (capability.available !== true) return null;

    const assets = await uploadProblemOcrAssets(input.images);
    let response: Response;
    try {
      response = await fetch("/api/jobs/problem-ocr", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          assets,
          chapterContext: input.chapterContext,
          qwenModel: input.qwenModel,
          deepseekModel: input.deepseekModel,
        }),
        cache: "no-store",
      });
    } catch (error: unknown) {
      throw new Error(`${error instanceof Error ? error.message : "题库 OCR 任务登记请求中断"}；为避免破坏可能已登记的任务，临时源图已保留。`);
    }

    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (response.status === 503 && payload.availability === "schema_pending") {
      await deleteProblemOcrAssets(assets.map((asset) => asset.path));
      return null;
    }
    if ([400, 401, 403].includes(response.status)) {
      await deleteProblemOcrAssets(assets.map((asset) => asset.path)).catch(() => undefined);
    }
    if (!response.ok) {
      const suffix = response.status >= 500
        ? "；临时源图已保留，避免破坏可能已经登记的任务"
        : "";
      throw new Error(`${toText(payload.error) || "题库 OCR 持久任务创建失败"}${suffix}`);
    }
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job) {
      throw new Error("任务账本没有返回有效的题库 OCR 任务；临时源图已保留，请先检查任务中心再重试");
    }
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createLocalProblemOcrJob = useCallback((title: string) => {
    const now = new Date().toISOString();
    const job: ClientJob = {
      id: createJobId(),
      type: "problem_ocr",
      class: "internal",
      title,
      status: "running",
      phase: "识别题目",
      statusText: "正在识别图片并整理题目",
      createdAt: now,
      updatedAt: now,
      heartbeatAt: now,
      pollCount: 0,
      progress: 5,
    };
    setJobs((current) => [job, ...current].slice(0, MAX_HISTORY));
    return job;
  }, []);

  const createBatchGradeJob = useCallback((title: string) => {
    const now = new Date().toISOString();
    const job: ClientJob = {
      id: createJobId(),
      type: "batch_grade",
      class: "internal",
      title,
      status: "running",
      phase: "读取确认版本",
      statusText: "正在按固定真题与评分细则生成建议分",
      createdAt: now,
      updatedAt: now,
      heartbeatAt: now,
      pollCount: 0,
      progress: 10,
    };
    setJobs((current) => [job, ...current].slice(0, MAX_HISTORY));
    return job;
  }, []);

  const cancelJob = useCallback((id: string) => {
    const target = jobs.find((job) => job.id === id);
    if (!target || !isClientJobActive(target) || cancelledRef.current.has(id)) return;

    cancelledRef.current.add(id);
    const now = new Date().toISOString();
    updateJob(id, {
      status: "cancelled",
      phase: "任务已取消",
      statusText: target.remoteJobId
        ? "已停止本地轮询，正在同步跨设备任务账本"
        : "任务已取消，已停止本地跟踪",
      heartbeatAt: now,
      error: undefined,
    });

    void (async () => {
      try {
        if (target.remoteJobId) {
          const response = await fetch(`/api/jobs/${encodeURIComponent(target.remoteJobId)}/cancel`, {
            method: "POST",
            headers: await buildAuthHeaders(),
            cache: "no-store",
          });
          const payload = await response.json().catch(() => ({})) as JobMutationResponse;
          if (response.status === 503 && payload.availability === "schema_pending") {
            updateJob(id, {
              ledgerState: "schema_pending",
              statusText: "已在本机取消；任务账本迁移后再同步",
            });
          } else {
            if (!response.ok) throw new Error(toText(payload.error) || "任务取消同步失败");
            const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
            if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
          }
        }

        await cleanupSource({ ...target, status: "cancelled" });
      } catch (error: unknown) {
        cancelledRef.current.delete(id);
        updateJob(id, {
          status: target.status,
          phase: "取消同步失败",
          statusText: "取消请求失败，任务仍保留在消息中心，可再次尝试",
          error: error instanceof Error ? error.message : "任务取消失败",
        });
      }
    })();
  }, [cleanupSource, jobs, updateJob]);

  const retryJob = useCallback((id: string) => {
    const target = jobs.find((job) => job.id === id);
    if (!target || !canRetryClientJob(target)) return;

    if (target.class === "internal" && target.remoteJobId) {
      updateJob(id, {
        status: "waiting_for_trigger",
        phase: "正在重置失败分块",
        statusText: "已请求持久任务重试",
        error: undefined,
      });
      void (async () => {
        try {
          const response = await fetch(`/api/jobs/${encodeURIComponent(target.remoteJobId ?? "")}/retry`, {
            method: "POST",
            headers: await buildAuthHeaders(),
            cache: "no-store",
          });
          const payload = await response.json().catch(() => ({})) as JobMutationResponse;
          if (!response.ok) throw new Error(toText(payload.error) || "站内任务重试失败");
          const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
          if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
        } catch (error: unknown) {
          updateJob(id, {
            status: "failed",
            phase: "重试失败",
            statusText: "失败记录仍保留，可稍后再次重试",
            error: error instanceof Error ? error.message : "站内任务重试失败",
          });
        }
      })();
      return;
    }

    updateJob(id, {
      status: "queued",
      phase: "等待重新查询",
      statusText: "已请求重试",
      error: undefined,
    });
  }, [jobs, updateJob]);

  const loadJobResult = useCallback(async (id: string) => {
    const target = jobs.find((job) => job.id === id);
    if (
      !target?.remoteJobId
      || target.resultMarkdown
      || target.resultPayload
      || resultLoadingRef.current.has(id)
    ) return;
    resultLoadingRef.current.add(id);
    updateJob(id, {
      phase: "正在恢复结果",
      statusText: "正在从跨设备任务账本读取 OCR 结果",
      error: undefined,
    });

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(target.remoteJobId)}/result`, {
        headers: await buildAuthHeaders(),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { error?: unknown; job?: unknown };
      if (!response.ok) throw new Error(toText(payload.error) || "任务结果恢复失败");
      const result = normalizeRemoteJobResult(payload.job);
      if (target.type === "document_ocr" && !result.resultMarkdown) {
        throw new Error("任务已完成，但云端没有可领取的 Markdown 结果");
      }
      if (target.type !== "document_ocr" && !result.resultPayload) {
        throw new Error("任务已完成，但云端没有可领取的结构化结果");
      }
      updateJob(id, {
        ...result,
        phase: "结果待领取",
        statusText: target.type === "document_ocr"
          ? "OCR 结果已恢复，可以继续插入笔记"
          : "结构化结果已恢复，仍需在目标页面确认后应用",
        error: undefined,
      });
    } catch (error: unknown) {
      updateJob(id, {
        phase: "结果恢复失败",
        statusText: "任务记录仍保留，可稍后重新恢复结果",
        error: error instanceof Error ? error.message : "任务结果恢复失败",
      });
    } finally {
      resultLoadingRef.current.delete(id);
    }
  }, [jobs, updateJob]);

  const claimJobResult = useCallback((id: string) => {
    const target = jobs.find((job) => job.id === id);
    updateJob(id, { resultClaimedAt: new Date().toISOString(), phase: "结果已领取" });
    if (!target?.remoteJobId) return;

    void (async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(target.remoteJobId ?? "")}/claim`, {
          method: "POST",
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as { job?: unknown };
        if (!response.ok) throw new Error("任务领取状态同步失败");
        const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
        if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
      } catch {
        updateJob(id, { ledgerState: "sync_failed" });
      }
    })();
  }, [jobs, updateJob]);

  const dismissJob = useCallback((id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id || isClientJobActive(job)));
  }, []);

  const value = useMemo(() => ({
    jobs,
    createDocumentOcrJob,
    createMarkdownReviewJob,
    createProblemOcrJob,
    createLocalProblemOcrJob,
    createBatchGradeJob,
    updateJob,
    cancelJob,
    retryJob,
    loadJobResult,
    claimJobResult,
    dismissJob,
  }), [cancelJob, claimJobResult, createBatchGradeJob, createDocumentOcrJob, createLocalProblemOcrJob, createMarkdownReviewJob, createProblemOcrJob, dismissJob, jobs, loadJobResult, retryJob, updateJob]);

  const activeCount = jobs.filter(isClientJobActive).length;
  const unclaimedCount = jobs.filter((job) => job.status === "succeeded" && !job.resultClaimedAt).length;
  const bucketCounts = useMemo(() => ({
    pending: jobs.filter((job) => getJobBucket(job) === "pending").length + reviewNotices.length,
    running: jobs.filter((job) => getJobBucket(job) === "running").length,
    completed: jobs.filter((job) => getJobBucket(job) === "completed").length,
  }), [jobs, reviewNotices]);
  const displayBucket: JobBucket = activeBucket;
  const visibleJobs = jobs.filter((job) => getJobBucket(job) === displayBucket);
  const hasMessages = jobs.length > 0 || reviewNotices.length > 0;
  const attentionCount = activeCount + unclaimedCount + reviewNotices.length;

  useEffect(() => {
    if (!isOpen || !hasMessages) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [hasMessages, isOpen]);

  return (
    <JobCenterContext.Provider value={value}>
      {children}
      {!isUiLab && hasMessages && (
        <button
          type="button"
          className="job-center-fab"
          onClick={() => {
            setIsOpen(true);
            authRetryAfterRef.current.clear();
            void fetchRemoteJobLedger()
              .then((remoteJobs) => {
                if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
              })
              .catch(() => undefined);
            refreshReviewNotices();
          }}
          aria-label={`打开消息中心，${reviewNotices.length} 篇文章待审核，${activeCount} 个进行中，${unclaimedCount} 个待领取`}
        >
          {activeCount > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : reviewNotices.length > 0 ? <ShieldCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          <span>{attentionCount}</span>
        </button>
      )}

      {!isUiLab && isOpen && hasMessages && (
        <div className="job-center-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <aside ref={drawerRef} className="job-center-drawer" role="dialog" aria-modal="true" aria-label="消息中心" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setIsOpen(false);
            }
          }}>
            <header className="job-center-header">
              <div>
                <span>任务通知</span>
                <h2>消息中心</h2>
                <p>需要你决策、编辑或留意的事项会保留在这里。</p>
              </div>
              <button ref={drawerCloseRef} type="button" onClick={() => setIsOpen(false)} aria-label="关闭消息中心"><X className="h-5 w-5" /></button>
            </header>

            <div className="job-center-bucket-tabs" role="tablist" aria-label="消息状态分组">
              {(["pending", "running", "completed"] as JobBucket[]).map((bucket) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={displayBucket === bucket}
                  className={displayBucket === bucket ? "is-active" : ""}
                  key={bucket}
                  onClick={() => setActiveBucket(bucket)}
                >
                  {getJobBucketLabel(bucket)}
                  <span>{bucketCounts[bucket]}</span>
                </button>
              ))}
            </div>

            <div className="job-center-list" role="tabpanel">
              {visibleJobs.length === 0 && (
                <p className="job-center-empty">暂无{getJobBucketLabel(displayBucket)}事项。终态消息会保留 3 天后自动清理。</p>
              )}
              {displayBucket === "pending" && reviewNotices.map((notice) => (
                <article className="job-center-item job-center-review-item" key={`review-${notice.id}`}>
                  <div className="job-center-item-icon" data-status="review"><ShieldCheck /></div>
                  <div className="job-center-item-body">
                    <div className="job-center-item-title">
                      <strong>{notice.title}<span className="job-center-status" data-status="review">待审核</span></strong>
                      <time>{new Date(notice.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                    </div>
                    <p>AI 文章等待你的决定</p>
                    <small>{notice.authorName} · {getReviewSubjectLabel(notice.subject)} · v{notice.contentVersion}</small>
                    <div className="job-center-actions">
                      <Link href={`/tools/ai-review?proposal=${encodeURIComponent(notice.id)}`} onClick={() => setIsOpen(false)}>
                        打开审核
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
              {visibleJobs.map((job) => (
                <article className="job-center-item" key={job.id}>
                  <div className="job-center-item-icon" data-status={job.status}>
                    {job.status === "succeeded" || job.status === "claimed"
                      ? <CheckCircle2 />
                      : job.status === "failed"
                        ? <AlertTriangle />
                        : job.status === "cancelled"
                          ? <CircleX />
                          : <FileScan />}
                  </div>
                  <div className="job-center-item-body">
                    <div className="job-center-item-title">
                      <strong>{job.title}<span className="job-center-status" data-status={job.status}>{getJobStatusLabel(job)}</span></strong>
                      <time>{new Date(job.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
                    </div>
                    <p>{getClientJobProgressLabel(job)}</p>
                    <small>{job.statusText}</small>
                    {job.progress !== undefined && isClientJobActive(job) && (
                      <div className="job-center-progress" aria-label={`进度 ${Math.round(job.progress)}%`}>
                        <span style={{ width: `${job.progress}%` }} />
                      </div>
                    )}
                    {job.error && <pre>{job.error}</pre>}
                    {job.ledgerState === "synced" && <small>已保存到跨设备任务账本</small>}
                    {job.ledgerState === "schema_pending" && (
                      <small className="job-center-warning">当前仅保存在本机；数据库任务账本迁移后会自动同步</small>
                    )}
                    {job.ledgerState === "sync_failed" && (
                      <small className="job-center-warning">跨设备状态同步中断；本机记录仍保留，稍后会重试</small>
                    )}
                    {job.cleanupError && <small className="job-center-warning">临时文件尚未清理：{job.cleanupError}</small>}
                    <div className="job-center-actions">
                      {isClientJobActive(job) && (
                        <button type="button" className="job-center-cancel" onClick={() => cancelJob(job.id)}>
                          <X className="h-4 w-4" />
                          取消任务
                        </button>
                      )}
                      {canRetryClientJob(job) && (
                        <button type="button" onClick={() => retryJob(job.id)}>
                          <RotateCcw className="h-4 w-4" />
                          {job.cleanupError ? "重试临时源图清理" : job.class === "internal" ? "重试失败分块" : "重新查询"}
                        </button>
                      )}
                      {job.status === "succeeded" && !job.resultMarkdown && !job.resultPayload && job.remoteJobId && (
                        <button type="button" onClick={() => { void loadJobResult(job.id); }}>
                          恢复结果
                        </button>
                      )}
                      {!isClientJobActive(job) && (
                        <button type="button" onClick={() => dismissJob(job.id)}>移出历史</button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </JobCenterContext.Provider>
  );
}

export function useJobCenter(): JobCenterContextValue {
  const context = useContext(JobCenterContext);
  if (!context) throw new Error("useJobCenter 必须在 JobCenterProvider 内使用");
  return context;
}
