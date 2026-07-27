"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Cloud, FileImage, Loader2, Save, ScanText, ShieldCheck, Sparkles, X } from "lucide-react";
import { useJobCenter } from "@/components/jobs/JobCenter";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { AI_CONFIG_STORAGE_KEY, ALLOW_CLIENT_AI_KEYS, DEFAULT_AI_CONFIG, DEFAULT_QWEN_ENDPOINT, normalizeAIConfig } from "@/lib/ai-config";
import { readJsonStorage, writeJsonStorage } from "@/lib/browser-storage";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  appendMathPaperOcrRevision,
  canGradeMathPaperOcrPage,
  confirmMathPaperOcrRevision,
  type MathPaperOcrPage,
} from "@/lib/math-paper-ocr-contract";
import type { MathGradeStep, MathGradeSuggestion, MathPaperSummary } from "@/lib/math-training-core";

type LocalOcrPage = MathPaperOcrPage & {
  file?: File;
  previewUrl?: string;
  draftText: string;
  state: "queued" | "recognizing" | "recognized" | "confirmed" | "failed";
  error?: string;
};

const MATH_PAPER_OCR_SESSION_KEY = "asteroid:math-paper-ocr-session:v1";

type MathCoreMode = "loading" | "local" | "shared";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "请求失败");
  return payload;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function restoreSharedRoundState(value: unknown, targetRound: number): {
  attemptId: string | null;
  confirmationId: string | null;
  suggestionGradeId: string | null;
  suggestion: MathGradeSuggestion | null;
  finalSteps: MathGradeStep[];
  finalFeedback: string;
} {
  const state = asRecord(value);
  const attempt = recordArray(state.attempts).find((item) => Number(item.round) === targetRound);
  if (!attempt || typeof attempt.id !== "string") {
    return { attemptId: null, confirmationId: null, suggestionGradeId: null, suggestion: null, finalSteps: [], finalFeedback: "" };
  }
  const confirmation = recordArray(attempt.confirmations).sort((left, right) => Number(left.confirmationVersion) - Number(right.confirmationVersion)).at(-1);
  if (!confirmation || typeof confirmation.id !== "string") {
    return { attemptId: attempt.id, confirmationId: null, suggestionGradeId: null, suggestion: null, finalSteps: [], finalFeedback: "" };
  }
  const grades = recordArray(confirmation.grades);
  const aiGrade = grades.filter((grade) => grade.origin === "ai_suggested").sort((left, right) => Number(left.gradeSeq) - Number(right.gradeSeq)).at(-1);
  if (!aiGrade || typeof aiGrade.id !== "string") {
    return { attemptId: attempt.id, confirmationId: confirmation.id, suggestionGradeId: null, suggestion: null, finalSteps: [], finalFeedback: "" };
  }
  const normalizeSteps = (raw: unknown): MathGradeStep[] => recordArray(raw).flatMap((step): MathGradeStep[] => {
    if (typeof step.problemId !== "string" || typeof step.criterion !== "string") return [];
    return [{
      problemId: step.problemId,
      criterion: step.criterion,
      earnedScore: Number(step.earnedScore),
      maxScore: Number(step.maxScore),
      deductionReason: typeof step.deductionReason === "string" ? step.deductionReason : null,
    }];
  });
  const breakdown = asRecord(aiGrade.breakdown);
  const suggestion: MathGradeSuggestion = {
    score: Number(aiGrade.score),
    maxScore: Number(aiGrade.maxScore),
    feedback: typeof aiGrade.feedback === "string" ? aiGrade.feedback : "",
    strengths: stringArray(breakdown.strengths),
    issues: stringArray(breakdown.issues),
    suggestions: stringArray(breakdown.suggestions),
    confidence: Number(breakdown.confidence) || 0,
    steps: normalizeSteps(aiGrade.steps),
  };
  const finalGrade = grades.filter((grade) => grade.origin === "user_final").sort((left, right) => Number(left.gradeSeq) - Number(right.gradeSeq)).at(-1);
  return {
    attemptId: attempt.id,
    confirmationId: confirmation.id,
    suggestionGradeId: aiGrade.id,
    suggestion,
    finalSteps: finalGrade ? normalizeSteps(finalGrade.steps) : suggestion.steps,
    finalFeedback: finalGrade && typeof finalGrade.feedback === "string" ? finalGrade.feedback : suggestion.feedback,
  };
}

function createPage(file: File): LocalOcrPage {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    file,
    previewUrl: URL.createObjectURL(file),
    draftText: "",
    state: "queued",
    ocrRevisions: [],
    gradeRevisions: [],
  };
}

async function fileToPayload(file: File): Promise<{ base64: string; fingerprint: string }> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
  return { base64: dataUrl.split(",")[1] ?? "", fingerprint };
}

export function MathPaperOcrReview() {
  const toast = useToast();
  const { createBatchGradeJob, createLocalProblemOcrJob, updateJob } = useJobCenter();
  const [pages, setPages] = useState<LocalOcrPage[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [coreMode, setCoreMode] = useState<MathCoreMode>("loading");
  const [papers, setPapers] = useState<MathPaperSummary[]>([]);
  const [paperId, setPaperId] = useState("");
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [suggestionGradeId, setSuggestionGradeId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<MathGradeSuggestion | null>(null);
  const [finalSteps, setFinalSteps] = useState<MathGradeStep[]>([]);
  const [finalFeedback, setFinalFeedback] = useState("");
  const [startingAttempt, setStartingAttempt] = useState(false);
  const [restoringSharedState, setRestoringSharedState] = useState(false);
  const [savingConfirmation, setSavingConfirmation] = useState(false);
  const [grading, setGrading] = useState(false);
  const [confirmingFinal, setConfirmingFinal] = useState(false);
  const pagesRef = useRef<LocalOcrPage[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/math/papers", {
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        const payload = await readResponse(response);
        if (cancelled) return;
        const mode = payload.mode === "shared" ? "shared" : "local";
        const nextPapers = Array.isArray(payload.papers) ? payload.papers as MathPaperSummary[] : [];
        setCoreMode(mode);
        setPapers(nextPapers);
        setPaperId((current) => current || nextPapers[0]?.id || "");
      } catch {
        if (!cancelled) setCoreMode("local");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (coreMode !== "shared" || !paperId) return;
    let cancelled = false;
    setRestoringSharedState(true);
    void (async () => {
      try {
        const response = await fetch(`/api/math/attempt?paperId=${encodeURIComponent(paperId)}`, {
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        const payload = await readResponse(response);
        if (cancelled) return;
        const restored = restoreSharedRoundState(payload.state, round);
        setAttemptId(restored.attemptId);
        setConfirmationId(restored.confirmationId);
        setSuggestionGradeId(restored.suggestionGradeId);
        setSuggestion(restored.suggestion);
        setFinalSteps(restored.finalSteps);
        setFinalFeedback(restored.finalFeedback);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "数学跨设备状态恢复失败");
      } finally {
        if (!cancelled) setRestoringSharedState(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coreMode, paperId, round, toast]);

  useEffect(() => {
    const stored = readJsonStorage<unknown>(MATH_PAPER_OCR_SESSION_KEY, []);
    if (Array.isArray(stored)) {
      setPages(stored.flatMap((value): LocalOcrPage[] => {
        if (!value || typeof value !== "object") return [];
        const item = value as Partial<LocalOcrPage>;
        if (typeof item.id !== "string" || typeof item.fileName !== "string" || !Array.isArray(item.ocrRevisions) || !Array.isArray(item.gradeRevisions)) return [];
        const restored: LocalOcrPage = {
          id: item.id,
          fileName: item.fileName,
          draftText: typeof item.draftText === "string" ? item.draftText : "",
          state: item.state === "confirmed" ? "confirmed" : item.ocrRevisions.length > 0 ? "recognized" : "failed",
          ocrRevisions: item.ocrRevisions,
          gradeRevisions: item.gradeRevisions,
          error: item.ocrRevisions.length > 0 ? undefined : "原图未保留，请重新选择",
        };
        return [restored];
      }));
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    pagesRef.current = pages;
    if (hydratedRef.current) {
      writeJsonStorage(MATH_PAPER_OCR_SESSION_KEY, pages.map(({ file: _file, previewUrl: _previewUrl, ...page }) => page));
    }
  }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((page) => {
    if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
  }), []);

  const confirmedCount = pages.filter((page) => canGradeMathPaperOcrPage(page)).length;
  const allConfirmed = pages.length > 0 && confirmedCount === pages.length;
  const recognizedCount = pages.filter((page) => page.state === "recognized" || page.state === "confirmed").length;
  const progress = pages.length > 0 ? Math.round(((recognizedCount + confirmedCount) / (pages.length * 2)) * 100) : 0;

  const resetSharedConfirmation = () => {
    setConfirmationId(null);
    setSuggestionGradeId(null);
    setSuggestion(null);
    setFinalSteps([]);
    setFinalFeedback("");
  };

  const addFiles = (files: FileList | null) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) return;
    resetSharedConfirmation();
    setPages((current) => [...current, ...selected.map(createPage)].slice(0, 20));
  };

  const removePage = (id: string) => {
    resetSharedConfirmation();
    setPages((current) => {
      const target = current.find((page) => page.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((page) => page.id !== id);
    });
  };

  const recognizeAll = async () => {
    const targets = pages.filter((page) => page.state === "queued" || page.state === "failed");
    if (targets.length === 0 || recognizing) return;
    resetSharedConfirmation();
    const job = createLocalProblemOcrJob(`${targets.length} 页数学答题纸 OCR`);
    const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
    setRecognizing(true);
    let completed = 0;
    let failed = 0;

    for (const target of targets) {
      setPages((current) => current.map((page) => page.id === target.id ? { ...page, state: "recognizing", error: undefined } : page));
      try {
        if (!target.file) throw new Error("原图不在当前页面，请移除后重新选择这张图片");
        const { base64, fingerprint } = await fileToPayload(target.file);
        const response = await fetch("/api/ai/ocr", {
          method: "POST",
          headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: target.file.type,
            apiKey: ALLOW_CLIENT_AI_KEYS ? config.qwenApiKey : undefined,
            model: config.qwenModel,
            endpoint: config.qwenApiEndpoint || DEFAULT_QWEN_ENDPOINT,
          }),
        });
        const payload = await response.json() as { text?: unknown; error?: unknown };
        if (!response.ok || typeof payload.text !== "string" || !payload.text.trim()) {
          throw new Error(typeof payload.error === "string" ? payload.error : "OCR 没有返回文本");
        }
        setPages((current) => current.map((page) => page.id === target.id ? {
          ...page,
          ...appendMathPaperOcrRevision(page, {
            sourceFingerprint: fingerprint,
            rawText: payload.text as string,
            now: new Date().toISOString(),
          }),
          draftText: (payload.text as string).trim(),
          state: "recognized",
          error: undefined,
        } : page));
      } catch (error) {
        failed += 1;
        setPages((current) => current.map((page) => page.id === target.id ? {
          ...page,
          state: "failed",
          error: error instanceof Error ? error.message : "识别失败",
        } : page));
      } finally {
        completed += 1;
        updateJob(job.id, {
          progress: Math.round((completed / targets.length) * 100),
          phase: completed === targets.length ? "等待核对" : `识别第 ${completed + 1} 页`,
          statusText: `已处理 ${completed}/${targets.length} 页，请逐页核对 OCR 文本`,
          status: completed === targets.length ? (failed > 0 ? "failed" : "succeeded") : "running",
          resultPayload: completed === targets.length ? { summary: `OCR 已结束：成功 ${targets.length - failed} 页，失败 ${failed} 页；成功页仍须逐页确认` } : undefined,
        });
      }
    }
    setRecognizing(false);
  };

  const confirmPage = (id: string) => {
    setPages((current) => current.map((page) => {
      if (page.id !== id) return page;
      const revision = page.ocrRevisions.at(-1);
      if (!revision) return page;
      try {
        const confirmedPage = confirmMathPaperOcrRevision(page, revision.id, page.draftText, new Date().toISOString());
        return {
          ...page,
          ...confirmedPage,
          state: "confirmed",
        };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "确认失败");
        return page;
      }
    }));
  };

  const reopenPageReview = (id: string) => {
    resetSharedConfirmation();
    setPages((current) => current.map((page) => {
      if (page.id !== id) return page;
      const latest = page.ocrRevisions.at(-1);
      if (!latest) return page;
      const reopenedPage = appendMathPaperOcrRevision(page, {
        sourceFingerprint: latest.sourceFingerprint,
        rawText: page.draftText,
        now: new Date().toISOString(),
      });
      return {
        ...page,
        ...reopenedPage,
        state: "recognized",
      };
    }));
  };

  const startSharedAttempt = async () => {
    if (coreMode !== "shared" || !paperId || startingAttempt) return;
    setStartingAttempt(true);
    resetSharedConfirmation();
    try {
      const response = await fetch("/api/math/attempt", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "start", paperId, round, commandId: crypto.randomUUID() }),
      });
      const payload = await readResponse(response);
      const result = asRecord(payload.result);
      const nextAttemptId = typeof result.attemptId === "string" ? result.attemptId : "";
      if (!nextAttemptId) throw new Error("数据库没有返回数学训练轮次");
      setAttemptId(nextAttemptId);
      toast.success(`第 ${round} 轮数学真题训练已建立`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数学训练轮次创建失败");
    } finally {
      setStartingAttempt(false);
    }
  };

  const saveSharedConfirmation = async () => {
    if (coreMode !== "shared" || !attemptId || !paperId || !allConfirmed || savingConfirmation) return;
    setSavingConfirmation(true);
    try {
      const confirmationPages = pages.map((page, index) => {
        const revision = page.ocrRevisions.at(-1);
        if (!revision?.confirmedText?.trim()) throw new Error(`第 ${index + 1} 页尚未确认`);
        return {
          fileName: page.fileName,
          sourceFingerprint: revision.sourceFingerprint,
          rawText: revision.rawText,
          confirmedText: revision.confirmedText,
        };
      });
      const response = await fetch("/api/math/attempt", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "confirm_ocr",
          paperId,
          attemptId,
          commandId: crypto.randomUUID(),
          pages: confirmationPages,
        }),
      });
      const payload = await readResponse(response);
      const result = asRecord(payload.result);
      const nextConfirmationId = typeof result.confirmationId === "string" ? result.confirmationId : "";
      if (!nextConfirmationId) throw new Error("数据库没有返回 OCR 确认版本");
      setConfirmationId(nextConfirmationId);
      setSuggestionGradeId(null);
      setSuggestion(null);
      toast.success(`OCR 确认 v${Number(result.confirmationVersion) || 1} 已保存；现在才能请求建议分`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OCR 确认版本保存失败");
    } finally {
      setSavingConfirmation(false);
    }
  };

  const generateSharedSuggestion = async () => {
    if (!confirmationId || !paperId || grading) return;
    const job = createBatchGradeJob("数学真题整套建议评分");
    setGrading(true);
    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      const gradeResponse = await fetch("/api/ai/math-paper-grade", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          confirmationId,
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
        }),
      });
      const gradePayload = await readResponse(gradeResponse);
      const candidate = asRecord(gradePayload.suggestion);
      if (!Array.isArray(candidate.steps) || typeof candidate.feedback !== "string") {
        throw new Error("建议评分结构不完整");
      }
      const nextSuggestion = candidate as unknown as MathGradeSuggestion;
      updateJob(job.id, { progress: 65, phase: "保存建议分", statusText: "模型已返回，正在写入追加式评分账本" });
      const persistResponse = await fetch("/api/math/grade", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "record_suggestion",
          paperId,
          confirmationId,
          commandId: crypto.randomUUID(),
          score: nextSuggestion.score,
          maxScore: nextSuggestion.maxScore,
          feedback: nextSuggestion.feedback,
          breakdown: {
            strengths: nextSuggestion.strengths,
            issues: nextSuggestion.issues,
            suggestions: nextSuggestion.suggestions,
            confidence: nextSuggestion.confidence,
            model: gradePayload.model,
          },
          steps: nextSuggestion.steps,
        }),
      });
      const persisted = await readResponse(persistResponse);
      const result = asRecord(persisted.result);
      const gradeId = typeof result.gradeId === "string" ? result.gradeId : "";
      if (!gradeId) throw new Error("建议分没有写入评分账本");
      setSuggestion(nextSuggestion);
      setSuggestionGradeId(gradeId);
      setFinalSteps(nextSuggestion.steps.map((step) => ({ ...step })));
      setFinalFeedback(nextSuggestion.feedback);
      updateJob(job.id, {
        progress: 100,
        phase: "等待用户终评",
        statusText: `AI 建议 ${nextSuggestion.score}/${nextSuggestion.maxScore}，需人工确认后才计入成绩`,
        status: "succeeded",
        resultPayload: { summary: "建议分已生成并保存；请回到数学真题页逐步核对后确认终分" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "数学建议评分失败";
      updateJob(job.id, { status: "failed", phase: "建议评分失败", statusText: "任务保留在任务中心，可重新发起", error: message });
      toast.error(message);
    } finally {
      setGrading(false);
    }
  };

  const updateFinalStep = (index: number, patch: Partial<MathGradeStep>) => {
    setFinalSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  };

  const confirmSharedFinal = async () => {
    if (!suggestionGradeId || !paperId || confirmingFinal) return;
    const finalScore = finalSteps.reduce((sum, step) => sum + Number(step.earnedScore || 0), 0);
    setConfirmingFinal(true);
    try {
      const response = await fetch("/api/math/grade", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "confirm_final",
          paperId,
          suggestionGradeId,
          commandId: crypto.randomUUID(),
          score: finalScore,
          feedback: finalFeedback,
          breakdown: { decision: "user_confirmed_or_edited", suggestionGradeId },
          steps: finalSteps,
        }),
      });
      await readResponse(response);
      toast.success(`最终分 ${finalScore}/${suggestion?.maxScore ?? "?"} 已追加保存；AI 建议仍保留为历史`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数学最终分确认失败");
    } finally {
      setConfirmingFinal(false);
    }
  };

  const statusText = useMemo(() => pages.length === 0
    ? "尚未导入答题纸"
    : allConfirmed
      ? "全部 OCR 文本已人工确认，可以进入评分准备"
      : `已识别 ${recognizedCount}/${pages.length} 页，已确认 ${confirmedCount}/${pages.length} 页`, [allConfirmed, confirmedCount, pages.length, recognizedCount]);

  return (
    <>
      <PageHeader
        width="workspace"
        title="数学真题 OCR 核对"
        description="结束整套作答后统一识别；逐页核对无误前，评分入口保持锁定。"
        stats={[
          { label: "答题页", value: pages.length },
          { label: "已识别", value: recognizedCount },
          { label: "已确认", value: confirmedCount, tone: "text-green-600" },
          { label: "流程", value: `${progress}%` },
        ]}
      />
      <PageShell width="workspace" topPadding="content">
        <section className="command-bar p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-on-surface">{statusText}</div>
              <div className="mt-1 text-xs text-on-surface-variant">重新识别会追加 OCR 版本；旧确认与旧评分保留为历史，但不再冒充当前结果。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="control-button h-10 cursor-pointer px-3 text-sm">
                <FileImage className="h-4 w-4" />
                选择答题纸
                <input type="file" multiple accept="image/*" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
              </label>
              <button type="button" onClick={recognizeAll} disabled={recognizing || pages.length === 0} className="control-button control-button-primary h-10 px-3 text-sm">
                {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                结束作答并统一 OCR
              </button>
            </div>
          </div>
          <div className="mt-4 border-t border-outline-variant/20 pt-4">
            {coreMode === "shared" ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
                <label className="grid gap-1.5 text-xs text-on-surface-variant">
                  固定真题
                  <select
                    value={paperId}
                    onChange={(event) => {
                      setPaperId(event.target.value);
                      setAttemptId(null);
                      resetSharedConfirmation();
                    }}
                    className="field-control h-10 px-3 text-sm"
                  >
                    <option value="">选择已导入真题</option>
                    {papers.map((paper) => (
                      <option key={paper.id} value={paper.id}>{paper.title} · {paper.problemCount} 题 · {paper.maxScore} 分</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs text-on-surface-variant">
                  三刷轮次
                  <select
                    value={round}
                    onChange={(event) => {
                      setRound(Number(event.target.value) as 1 | 2 | 3);
                      setAttemptId(null);
                      resetSharedConfirmation();
                    }}
                    className="field-control h-10 px-3 text-sm"
                  >
                    <option value={1}>第 1 轮</option>
                    <option value={2}>第 2 轮</option>
                    <option value={3}>第 3 轮</option>
                  </select>
                </label>
                <button type="button" onClick={startSharedAttempt} disabled={!paperId || startingAttempt || restoringSharedState || Boolean(attemptId)} className="control-button h-10 px-3 text-sm">
                  {(startingAttempt || restoringSharedState) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  {restoringSharedState ? "恢复跨设备记录" : attemptId ? `第 ${round} 轮已建立` : `建立第 ${round} 轮`}
                </button>
              </div>
            ) : (
              <p className="text-xs leading-5 text-on-surface-variant">
                {coreMode === "loading" ? "正在检查数学共享训练核…" : "当前为本机兼容模式：OCR 核对可用，但不会冒充跨设备训练记录；部署 0019 并显式启用后才开放评分。"}
              </p>
            )}
          </div>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-4">
            {pages.length === 0 ? (
              <div className="surface-panel flex min-h-[26rem] flex-col items-center justify-center gap-3 p-6 text-center text-on-surface-variant">
                <FileImage className="h-10 w-10 opacity-40" />
                <p>完成整套纸笔作答后，在这里一次选择所有答题页。</p>
              </div>
            ) : pages.map((page, index) => {
              const revision = page.ocrRevisions.at(-1);
              const confirmed = canGradeMathPaperOcrPage(page);
              return (
                <article key={page.id} className="surface-panel overflow-hidden">
                  <header className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-4 py-3">
                    <div className="text-sm font-semibold text-on-surface">第 {index + 1} 页 · {page.fileName}</div>
                    <button type="button" onClick={() => removePage(page.id)} disabled={recognizing} className="control-button h-8 w-8 p-0" aria-label={`移除第 ${index + 1} 页`}><X className="h-4 w-4" /></button>
                  </header>
                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-low">
                      {page.previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- local OCR previews use temporary blob URLs. */}
                          <img src={page.previewUrl} alt={`第 ${index + 1} 页原图`} className="max-h-[34rem] w-full object-contain" />
                        </>
                      ) : <p className="px-4 text-center text-sm text-on-surface-variant">原图仅保留在当前页面；如已刷新，请移除本页后重新选择图片。</p>}
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-on-surface-variant">
                        <span>{revision ? `OCR v${revision.revisionNo}` : "等待识别"}</span>
                        <span>{confirmed ? "已人工确认" : page.state === "failed" ? "识别失败" : "未确认"}</span>
                      </div>
                      <textarea
                        value={page.draftText}
                        onChange={(event) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, draftText: event.target.value, state: item.state === "confirmed" ? "recognized" : item.state } : item))}
                        disabled={!revision || page.state === "recognizing" || confirmed}
                        rows={16}
                        className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
                        placeholder="OCR 完成后，在这里逐字核对和修正。"
                      />
                      {page.error && <p className="mt-2 text-sm text-red-600">{page.error}</p>}
                      {confirmed ? (
                        <button type="button" onClick={() => reopenPageReview(page.id)} className="control-button mt-3 h-10 w-full px-3 text-sm">发现问题，追加核对版本</button>
                      ) : (
                        <button type="button" onClick={() => confirmPage(page.id)} disabled={!revision || !page.draftText.trim()} className="control-button control-button-primary mt-3 h-10 w-full px-3 text-sm">
                          <Check className="h-4 w-4" />
                          确认本页 OCR 无误
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="surface-panel h-fit p-4 xl:sticky xl:top-24">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold text-on-surface">评分安全门</h2></div>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-on-surface-variant">
              <li>1. 整套作答结束后统一上传。</li>
              <li>2. OCR 结果与原图逐页对照。</li>
              <li>3. 每页由你明确确认。</li>
              <li>4. AI 只产生建议分。</li>
              <li>5. 你确认后才形成最终分。</li>
            </ol>
            {coreMode === "shared" ? (
              <div className="mt-5 space-y-2">
                <button type="button" disabled={!allConfirmed || !attemptId || savingConfirmation} onClick={saveSharedConfirmation} className="control-button control-button-primary h-11 w-full px-3 text-sm">
                  {savingConfirmation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {confirmationId ? "OCR 确认版本已保存" : !attemptId ? "先建立训练轮次" : !allConfirmed ? "确认全部页面后保存" : "保存 OCR 确认版本"}
                </button>
                <button type="button" disabled={!confirmationId || grading} onClick={generateSharedSuggestion} className="control-button h-11 w-full px-3 text-sm">
                  {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {suggestion ? "重新生成并追加建议分" : "生成 AI 建议分"}
                </button>
              </div>
            ) : (
              <button type="button" disabled={!allConfirmed} onClick={() => toast.info("OCR 安全门已通过；真实真题、评分细则和共享迁移接入后才开放建议评分。") } className="control-button control-button-primary mt-5 h-11 w-full px-3 text-sm">
                {allConfirmed ? "OCR 核对已完成" : "确认全部页面后解锁"}
              </button>
            )}
            <p className="mt-3 text-xs leading-5 text-on-surface-variant">缺少固定真题、标准答案、评分细则或数据库确认 ID 时不会请求评分，也不会生成占位分数。</p>
          </aside>
        </div>

        {suggestion && suggestionGradeId && (
          <section className="surface-panel mt-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/20 pb-4">
              <div>
                <div className="text-xs font-semibold text-primary">AI 建议 · 尚未计入正式成绩</div>
                <h2 className="mt-1 text-lg font-semibold text-on-surface">逐步核对并确认最终分</h2>
                <p className="mt-1 text-sm text-on-surface-variant">每个得分点都可修改；确认后会追加 user_final，原建议不会被覆盖。</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold text-on-surface">{finalSteps.reduce((sum, step) => sum + Number(step.earnedScore || 0), 0)} / {suggestion.maxScore}</div>
                <div className="text-xs text-on-surface-variant">AI 原建议 {suggestion.score} 分</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {finalSteps.map((step, index) => (
                <div key={`${step.problemId}-${index}`} className="grid gap-3 rounded-lg border border-outline-variant/20 p-3 md:grid-cols-[minmax(10rem,1fr)_7rem_minmax(12rem,1fr)] md:items-end">
                  <div>
                    <div className="text-xs text-on-surface-variant">题目 {step.problemId.slice(0, 8)} · 评分点</div>
                    <div className="mt-1 text-sm font-medium text-on-surface">{step.criterion}</div>
                  </div>
                  <label className="grid gap-1 text-xs text-on-surface-variant">
                    得分 / {step.maxScore}
                    <input
                      type="number"
                      min={0}
                      max={step.maxScore}
                      step={0.5}
                      value={step.earnedScore}
                      onChange={(event) => updateFinalStep(index, { earnedScore: Number(event.target.value) })}
                      className="field-control h-10 px-3 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-on-surface-variant">
                    扣分原因（满分可留空）
                    <input
                      value={step.deductionReason ?? ""}
                      onChange={(event) => updateFinalStep(index, { deductionReason: event.target.value || null })}
                      className="field-control h-10 px-3 text-sm"
                    />
                  </label>
                </div>
              ))}
            </div>
            <label className="mt-4 grid gap-1.5 text-xs text-on-surface-variant">
              最终总评
              <textarea value={finalFeedback} onChange={(event) => setFinalFeedback(event.target.value)} rows={4} className="field-control resize-y px-3 py-2 text-sm leading-6" />
            </label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-on-surface-variant">数据库会再次核验：逐步得分合计、逐题满分覆盖、最新 confirmation 绑定和三轮门。</p>
              <button type="button" onClick={confirmSharedFinal} disabled={confirmingFinal || !finalFeedback.trim()} className="control-button control-button-primary h-11 px-4 text-sm">
                {confirmingFinal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                确认并追加最终分
              </button>
            </div>
          </section>
        )}
      </PageShell>
    </>
  );
}
