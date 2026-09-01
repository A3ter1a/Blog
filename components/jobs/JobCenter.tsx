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
import { useAiAccountSlot } from "@/hooks/useAiAccountSlot";
import { useDialogFocus } from "@/hooks/useDialogFocus";
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
  uploadMathPaperOcrAssets,
  uploadProblemOcrAssets,
  type MathPaperOcrUploadInput,
  type ProblemOcrUploadInput,
} from "@/lib/supabase-storage";
import type { ProblemOcrChapterContextItem } from "@/lib/problem-ocr-contract";
import type { Math3SelfTestDifficulty, Math3SelfTestMode } from "@/lib/math3-self-test";
import type { Math3ProblemClassifyInput } from "@/lib/math3-classification";
import type { Math3StepGradeQuestionSnapshot, Math3StepGradeRubricSnapshot } from "@/lib/server-math3-step-grade";

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
  targetId: string;
};

type CreateProblemOcrJobInput = {
  images: ProblemOcrUploadInput[];
  chapterContext: ProblemOcrChapterContextItem[];
  qwenModel: string;
  deepseekModel: string;
  targetId: string;
};

type CreateMath3SelfTestJobInput = {
  mode: Math3SelfTestMode;
  difficulty: Math3SelfTestDifficulty;
};

type CreateMathPaperGradeJobInput = {
  paperId: string;
  confirmationId: string;
};

type CreateMathPaperOcrJobInput = {
  images: MathPaperOcrUploadInput[];
  qwenModel: string;
};

type CreateMath3ClassifyJobInput = {
  problems: Math3ProblemClassifyInput[];
  sourceChecksum: string;
  scopeLabel: string;
  targetId: string;
};

type CreateEnglishSubjectiveGradeJobInput = {
  passageId: string;
  round: 1 | 2 | 3;
  answers: Record<string, string>;
};

type CreateEconomicsGraphJobInput = {
  prompt: string;
  model: string;
  apiKey?: string;
  targetId: string;
};

type CreateMath3StepGradeJobInput = {
  testId: string;
  question: Math3StepGradeQuestionSnapshot;
  step: Math3StepGradeRubricSnapshot;
  studentAnswer: string;
  model: string;
  apiKey?: string;
  targetId: string;
};

type CreateKnowledgeQuizJobInput = {
  proposalId: string;
};

type JobCenterContextValue = {
  jobs: ClientJob[];
  createDocumentOcrJob: (input: CreateDocumentOcrJobInput) => ClientJob;
  createMarkdownReviewJob: (input: CreateMarkdownReviewJobInput) => Promise<ClientJob>;
  createProblemOcrJob: (input: CreateProblemOcrJobInput) => Promise<ClientJob>;
  createMath3SelfTestJob: (input: CreateMath3SelfTestJobInput) => Promise<ClientJob>;
  createMathPaperGradeJob: (input: CreateMathPaperGradeJobInput) => Promise<ClientJob>;
  createMathPaperOcrJob: (input: CreateMathPaperOcrJobInput) => Promise<ClientJob>;
  createMath3ClassifyJob: (input: CreateMath3ClassifyJobInput) => Promise<ClientJob>;
  createEnglishSubjectiveGradeJob: (input: CreateEnglishSubjectiveGradeJobInput) => Promise<ClientJob>;
  createEconomicsGraphJob: (input: CreateEconomicsGraphJobInput) => Promise<ClientJob>;
  createMath3StepGradeJob: (input: CreateMath3StepGradeJobInput) => Promise<ClientJob>;
  createKnowledgeQuizJob: (input: CreateKnowledgeQuizJobInput) => Promise<ClientJob>;
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
const MAX_HISTORY = 100;

type JobBucket = "pending" | "running" | "completed";

function getJobBucket(job: ClientJob): JobBucket {
  if (job.status === "running") return "running";
  if (job.status === "queued" || job.status === "waiting_for_trigger") return "pending";
  return "completed";
}

function getJobBucketLabel(bucket: JobBucket): string {
  if (bucket === "pending") return "待处理";
  if (bucket === "running") return "进行中";
  return "已结束";
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
  const response = await fetch("/api/jobs?limit=100", { headers, cache: "no-store" });
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
  const aiAccountSlot = useAiAccountSlot();
  const isUiLab = pathname.startsWith("/ui-lab/");
  const skipRemoteLedger = isUiLab;
  const jobStorageKey = aiAccountSlot ? `${CLIENT_JOB_STORAGE_KEY}:${aiAccountSlot}` : CLIENT_JOB_STORAGE_KEY;
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [reviewNotices, setReviewNotices] = useState<PendingReviewNotice[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeBucket, setActiveBucket] = useState<JobBucket>("pending");
  const hydratedRef = useRef(false);
  const jobsRef = useRef<ClientJob[]>([]);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
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
    if (skipRemoteLedger) {
      hydratedRef.current = true;
      return;
    }

    queueMicrotask(() => {
      try {
        const stored = removeExpiredClientJobs(
            normalizeStoredJobs(JSON.parse(localStorage.getItem(jobStorageKey) ?? "[]")),
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
  }, [jobStorageKey, skipRemoteLedger]);

  useEffect(() => {
    if (skipRemoteLedger) return;

    const cleanup = () => {
      setJobs((current) => removeExpiredClientJobs(current));
    };
    cleanup();
    const timer = window.setInterval(cleanup, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [skipRemoteLedger]);

  useEffect(() => {
    if (skipRemoteLedger) return;

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
  }, [skipRemoteLedger, refreshReviewNotices]);

  useEffect(() => {
    const timer = window.setTimeout(refreshReviewNotices, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, refreshReviewNotices]);

  useEffect(() => {
    window.addEventListener(AI_REVIEW_QUEUE_CHANGED_EVENT, refreshReviewNotices);
    return () => window.removeEventListener(AI_REVIEW_QUEUE_CHANGED_EVENT, refreshReviewNotices);
  }, [refreshReviewNotices]);

  useEffect(() => {
    if (skipRemoteLedger) return;

    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        jobStorageKey,
        JSON.stringify(prepareClientJobsForStorage(jobs.slice(0, MAX_HISTORY))),
      );
    } catch {
      // 云端已同步结果不会重复塞进 localStorage；本机存储满时保留当前内存状态。
    }
  }, [jobStorageKey, skipRemoteLedger, jobs]);

  useEffect(() => {
    if (skipRemoteLedger) return;

    const sync = (event: StorageEvent) => {
      if (event.key !== jobStorageKey || !event.newValue) return;
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
  }, [jobStorageKey, skipRemoteLedger]);

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
    if (skipRemoteLedger) return;
    if (!activeJobPollKey) return;

    const pollAll = () => jobsRef.current
      .filter(isClientJobActive)
      .forEach((job) => { void pollJob(job); });
    pollAll();
    const timer = window.setInterval(pollAll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeJobPollKey, skipRemoteLedger, pollJob]);

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
    if (capability.available !== true) throw new Error("题库 OCR 持久任务尚未启用，未开始上传原图");

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
          targetId: input.targetId,
        }),
        cache: "no-store",
      });
    } catch (error: unknown) {
      throw new Error(`${error instanceof Error ? error.message : "题库 OCR 任务登记请求中断"}；为避免破坏可能已登记的任务，临时源图已保留。`);
    }

    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (response.status === 503 && payload.availability === "schema_pending") {
      await deleteProblemOcrAssets(assets.map((asset) => asset.path));
      throw new Error("题库 OCR 持久任务尚未启用，临时源图已清理");
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

  const createMath3SelfTestJob = useCallback(async (input: CreateMath3SelfTestJobInput) => {
    const response = await fetch("/api/jobs/math3-self-test", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "数学三试卷生成任务创建失败");
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job || job.type !== "math3_self_test_generation") {
      throw new Error("任务账本没有返回有效的数学三试卷生成任务");
    }
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createMathPaperGradeJob = useCallback(async (input: CreateMathPaperGradeJobInput) => {
    const response = await fetch("/api/jobs/math-paper-grade", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "数学真题建议评分任务创建失败");
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job || job.type !== "math_paper_grade") {
      throw new Error("任务账本没有返回有效的数学真题建议评分任务");
    }
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createMathPaperOcrJob = useCallback(async (input: CreateMathPaperOcrJobInput) => {
    const capabilityResponse = await fetch("/api/jobs/math-paper-ocr", {
      headers: await buildAuthHeaders(),
      cache: "no-store",
    });
    const capability = await capabilityResponse.json().catch(() => ({})) as JobMutationResponse;
    if (!capabilityResponse.ok) throw new Error(toText(capability.error) || "数学答题纸 OCR 持久任务能力检查失败");
    if (capability.available !== true) throw new Error("数学答题纸 OCR 持久任务尚未启用，未开始上传原图");

    const assets = await uploadMathPaperOcrAssets(input.images);
    let response: Response;
    try {
      response = await fetch("/api/jobs/math-paper-ocr", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assets, qwenModel: input.qwenModel }),
        cache: "no-store",
      });
    } catch (error: unknown) {
      throw new Error(`${error instanceof Error ? error.message : "数学答题纸 OCR 任务登记请求中断"}；为避免破坏可能已登记的任务，临时原图已保留。`);
    }
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if ([400, 401, 403].includes(response.status)) {
      await deleteProblemOcrAssets(assets.map((asset) => asset.path)).catch(() => undefined);
    }
    if (!response.ok) {
      const suffix = response.status >= 500 ? "；临时原图已保留，避免破坏可能已经登记的任务" : "";
      throw new Error(`${toText(payload.error) || "数学答题纸 OCR 持久任务创建失败"}${suffix}`);
    }
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job || job.type !== "math_paper_ocr") {
      throw new Error("任务账本没有返回有效的数学答题纸 OCR 任务；临时原图已保留，请先检查任务中心再重试");
    }
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createMath3ClassifyJob = useCallback(async (input: CreateMath3ClassifyJobInput) => {
    const response = await fetch("/api/jobs/math3-classify", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "数学三批量归类任务创建失败");
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job || job.type !== "math3_auto_classify") throw new Error("任务账本没有返回有效的数学三批量归类任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createEnglishSubjectiveGradeJob = useCallback(async (input: CreateEnglishSubjectiveGradeJobInput) => {
    const response = await fetch("/api/jobs/english-subjective-grade", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "英语主观题建议评分任务创建失败");
    const remoteJobs = normalizeRemoteJobRows(payload.job ? [payload.job] : []);
    const job = remoteJobs[0];
    if (!job || job.type !== "english_subjective_grade") throw new Error("任务账本没有返回有效的英语主观题建议评分任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createEconomicsGraphJob = useCallback(async (input: CreateEconomicsGraphJobInput) => {
    const response = await fetch("/api/ai/economics-graph", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "经济学曲线任务创建失败");
    const job = normalizeRemoteJobRows(payload.job ? [payload.job] : [])[0];
    if (!job || job.type !== "economics_graph_generation") throw new Error("任务账本没有返回有效的经济学曲线任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createMath3StepGradeJob = useCallback(async (input: CreateMath3StepGradeJobInput) => {
    const response = await fetch("/api/ai/math3-self-test/grade-step", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "数学三分步评分任务创建失败");
    const job = normalizeRemoteJobRows(payload.job ? [payload.job] : [])[0];
    if (!job || job.type !== "math3_step_grade") throw new Error("任务账本没有返回有效的数学三分步评分任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
    return job;
  }, []);

  const createKnowledgeQuizJob = useCallback(async (input: CreateKnowledgeQuizJobInput) => {
    const response = await fetch(`/api/ai/knowledge-quizzes/${encodeURIComponent(input.proposalId)}/generate`, {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as JobMutationResponse;
    if (!response.ok) throw new Error(toText(payload.error) || "知识点快测任务创建失败");
    const job = normalizeRemoteJobRows(payload.job ? [payload.job] : [])[0];
    if (!job || job.type !== "ai_knowledge_quiz_generation") throw new Error("任务账本没有返回有效的知识点快测任务");
    setJobs((current) => mergeClientJobLedgers(current, [job]));
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

        if (target.class === "external") {
          await cleanupSource({ ...target, status: "cancelled" });
        }
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
      statusText: target.type === "document_ocr"
        ? "正在从跨设备任务账本读取 OCR 结果"
        : target.type === "math3_self_test_generation"
          ? "正在从跨设备任务账本读取已审校试卷"
          : target.type === "math_paper_grade"
            ? "正在从跨设备任务账本读取已保存的数学建议分"
            : target.type === "math_paper_ocr"
              ? "正在从跨设备任务账本读取答题纸 OCR 文本"
              : target.type === "math3_auto_classify"
                ? "正在从跨设备任务账本读取数学三章节归类结果"
                : target.type === "english_subjective_grade"
                  ? "正在从跨设备任务账本读取英语主观题建议评分记录"
                  : target.type === "economics_graph_generation"
                    ? "正在从跨设备任务账本读取经济学曲线结构"
                    : target.type === "math3_step_grade"
                      ? "正在从跨设备任务账本读取数学三分步评分"
                      : target.type === "ai_knowledge_quiz_generation"
                        ? "正在从跨设备任务账本读取知识点快测记录"
          : "正在从跨设备任务账本读取结构化结果",
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
          : target.type === "math3_self_test_generation"
            ? "试卷结果已恢复，打开数学三自测即可保存并开始训练"
            : target.type === "math_paper_grade"
              ? "数学建议分已恢复，打开真题 OCR 页面即可逐步核对"
              : target.type === "math_paper_ocr"
                ? "答题纸 OCR 文本已恢复，打开真题 OCR 页面逐页核对"
                : target.type === "math3_auto_classify"
                  ? "归类结果已恢复，打开题目编辑器校验源题快照后应用"
                  : target.type === "english_subjective_grade"
                    ? "英语主观题建议已恢复，打开英语真题训练核对并确认终分"
                    : target.type === "economics_graph_generation"
                      ? "曲线结构已恢复，打开编辑页检查后插入正文"
                      : target.type === "math3_step_grade"
                        ? "分步评分已恢复，打开数学三自测写入进度"
                        : target.type === "ai_knowledge_quiz_generation"
                          ? "快测记录已恢复，打开 AI 内容工作台检查并提交审核"
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
    const target = jobs.find((job) => job.id === id);
    if (!target || isClientJobActive(target) || (target.status === "succeeded" && !target.resultClaimedAt)) return;
    setJobs((current) => current.filter((job) => job.id !== id));
    if (!target.remoteJobId) return;

    void (async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(target.remoteJobId ?? "")}`, {
          method: "DELETE",
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "任务移出历史失败");
      } catch (error: unknown) {
        const restored = {
          ...target,
          ledgerState: "sync_failed" as const,
          error: error instanceof Error ? error.message : "任务移出历史失败",
        };
        setJobs((current) => mergeClientJobLedgers(current, [restored]));
      }
    })();
  }, [jobs]);

  const value = useMemo(() => ({
    jobs,
    createDocumentOcrJob,
    createMarkdownReviewJob,
    createProblemOcrJob,
    createMath3SelfTestJob,
    createMathPaperGradeJob,
    createMathPaperOcrJob,
    createMath3ClassifyJob,
    createEnglishSubjectiveGradeJob,
    createEconomicsGraphJob,
    createMath3StepGradeJob,
    createKnowledgeQuizJob,
    updateJob,
    cancelJob,
    retryJob,
    loadJobResult,
    claimJobResult,
    dismissJob,
  }), [cancelJob, claimJobResult, createDocumentOcrJob, createEconomicsGraphJob, createEnglishSubjectiveGradeJob, createKnowledgeQuizJob, createMarkdownReviewJob, createMath3SelfTestJob, createMath3StepGradeJob, createMathPaperGradeJob, createMathPaperOcrJob, createMath3ClassifyJob, createProblemOcrJob, dismissJob, jobs, loadJobResult, retryJob, updateJob]);

  const activeCount = jobs.filter(isClientJobActive).length;
  const unclaimedCount = jobs.filter((job) => job.status === "succeeded" && !job.resultClaimedAt).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const bucketCounts = useMemo(() => ({
    pending: jobs.filter((job) => getJobBucket(job) === "pending").length + reviewNotices.length,
    running: jobs.filter((job) => getJobBucket(job) === "running").length,
    completed: jobs.filter((job) => getJobBucket(job) === "completed").length,
  }), [jobs, reviewNotices]);
  const displayBucket: JobBucket = activeBucket;
  const visibleJobs = jobs.filter((job) => getJobBucket(job) === displayBucket);
  const hasMessages = jobs.length > 0 || reviewNotices.length > 0;
  const attentionCount = activeCount + failedCount + unclaimedCount + reviewNotices.length;

  useDialogFocus({
    isOpen: isOpen && hasMessages,
    onClose: () => setIsOpen(false),
    containerRef: drawerRef,
    initialFocusRef: drawerCloseRef,
  });

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
            if (!skipRemoteLedger) {
              void fetchRemoteJobLedger()
                .then((remoteJobs) => {
                  if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
                })
                .catch(() => undefined);
            }
            refreshReviewNotices();
          }}
          aria-label={`打开消息中心，${reviewNotices.length} 篇文章待审核，${activeCount} 个进行中，${failedCount} 个失败，${unclaimedCount} 个待领取`}
        >
          {failedCount > 0 ? <AlertTriangle className="h-5 w-5" /> : activeCount > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : reviewNotices.length > 0 ? <ShieldCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          <span>{attentionCount}</span>
        </button>
      )}

      {!isUiLab && isOpen && hasMessages && (
        <div className="job-center-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <aside ref={drawerRef} className="job-center-drawer" role="dialog" aria-modal="true" aria-label="消息中心" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
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
                <p className="job-center-empty">暂无{getJobBucketLabel(displayBucket)}事项。已领取、失败或取消的消息保留 30 天；未领取结果持续保留。</p>
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
                      {job.type === "math3_self_test_generation" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/math3-self-test" onClick={() => setIsOpen(false)}>
                          打开并领取试卷
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "math_paper_grade" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/math-paper-ocr" onClick={() => setIsOpen(false)}>
                          打开并核对建议分
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "math_paper_ocr" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/math-paper-ocr" onClick={() => setIsOpen(false)}>
                          打开并核对 OCR
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "math3_auto_classify" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/create" onClick={() => setIsOpen(false)}>
                          打开并应用归类
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "english_subjective_grade" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/english-training" onClick={() => setIsOpen(false)}>
                          打开并核对建议分
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "economics_graph_generation" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/create" onClick={() => setIsOpen(false)}>
                          打开并插入曲线
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "math3_step_grade" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/math3-self-test" onClick={() => setIsOpen(false)}>
                          打开并写入评分
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {job.type === "ai_knowledge_quiz_generation" && job.status === "succeeded" && !job.resultClaimedAt && (
                        <Link href="/tools/ai-content" onClick={() => setIsOpen(false)}>
                          打开并审核快测
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      )}
                      {!isClientJobActive(job) && !(job.status === "succeeded" && !job.resultClaimedAt) && (
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
