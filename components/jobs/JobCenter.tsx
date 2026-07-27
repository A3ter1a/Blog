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
import { AlertTriangle, CheckCircle2, Clock3, FileScan, Loader2, RotateCcw, X } from "lucide-react";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
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

const JobCenterContext = createContext<JobCenterContextValue | null>(null);
const POLL_INTERVAL_MS = 6000;
const AUTH_RETRY_BACKOFF_MS = 30_000;
const MAX_HISTORY = 40;

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

export function JobCenterProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const hydratedRef = useRef(false);
  const jobsRef = useRef<ClientJob[]>([]);
  const pollingRef = useRef(new Set<string>());
  const resultLoadingRef = useRef(new Set<string>());
  const authRetryAfterRef = useRef(new Map<string, number>());

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = normalizeStoredJobs(JSON.parse(localStorage.getItem(CLIENT_JOB_STORAGE_KEY) ?? "[]"));
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
  }, []);

  useEffect(() => {
    const refresh = () => {
      authRetryAfterRef.current.clear();
      void fetchRemoteJobLedger()
        .then((remoteJobs) => {
          if (remoteJobs.length > 0) setJobs((current) => mergeClientJobLedgers(current, remoteJobs));
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        CLIENT_JOB_STORAGE_KEY,
        JSON.stringify(prepareClientJobsForStorage(jobs.slice(0, MAX_HISTORY))),
      );
    } catch {
      // 云端已同步结果不会重复塞进 localStorage；本机存储满时保留当前内存状态。
    }
  }, [jobs]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== CLIENT_JOB_STORAGE_KEY || !event.newValue) return;
      try {
        const stored = normalizeStoredJobs(JSON.parse(event.newValue));
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
  }, []);

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
    const canPollExternal = job.type === "document_ocr" && Boolean(job.externalTaskId);
    const canAdvanceInternal = job.class === "internal" && Boolean(job.remoteJobId);
    if ((!canPollExternal && !canAdvanceInternal) || pollingRef.current.has(job.id)) return;
    if ((authRetryAfterRef.current.get(job.id) ?? 0) > Date.now()) return;
    pollingRef.current.add(job.id);
    try {
      await withBrowserJobLock(job.remoteJobId ?? job.id, async () => {
        const authHeaders = await buildAuthHeaders();
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
    if (!activeJobPollKey) return;

    const pollAll = () => jobsRef.current
      .filter(isClientJobActive)
      .forEach((job) => { void pollJob(job); });
    pollAll();
    const timer = window.setInterval(pollAll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeJobPollKey, pollJob]);

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
    retryJob,
    loadJobResult,
    claimJobResult,
    dismissJob,
  }), [claimJobResult, createBatchGradeJob, createDocumentOcrJob, createLocalProblemOcrJob, createMarkdownReviewJob, createProblemOcrJob, dismissJob, jobs, loadJobResult, retryJob, updateJob]);

  const activeCount = jobs.filter(isClientJobActive).length;
  const unclaimedCount = jobs.filter((job) => job.status === "succeeded" && !job.resultClaimedAt).length;

  return (
    <JobCenterContext.Provider value={value}>
      {children}
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
        }}
        aria-label={`打开任务中心，${activeCount} 个进行中，${unclaimedCount} 个待领取`}
      >
        {activeCount > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}
        {(activeCount + unclaimedCount) > 0 && <span>{activeCount + unclaimedCount}</span>}
      </button>

      {isOpen && (
        <div className="job-center-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <aside className="job-center-drawer" role="dialog" aria-modal="true" aria-label="任务中心" onClick={(event) => event.stopPropagation()}>
            <header className="job-center-header">
              <div>
                <span>后台任务</span>
                <h2>任务中心</h2>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="关闭任务中心"><X className="h-5 w-5" /></button>
            </header>

            <div className="job-center-list">
              {jobs.length === 0 && <p className="job-center-empty">当前没有任务。长时间 OCR、导入和索引任务会显示在这里。</p>}
              {jobs.map((job) => (
                <article className="job-center-item" key={job.id}>
                  <div className="job-center-item-icon" data-status={job.status}>
                    {job.status === "succeeded" ? <CheckCircle2 /> : job.status === "failed" ? <AlertTriangle /> : <FileScan />}
                  </div>
                  <div className="job-center-item-body">
                    <div className="job-center-item-title">
                      <strong>{job.title}</strong>
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
