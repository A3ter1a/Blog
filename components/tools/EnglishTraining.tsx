"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useAdminAuth, useLocalReviewMode } from "@/hooks/useAdminAuth";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { subtleSurfaceMotion, uiMotion } from "@/lib/motion";
import { useEnglishDraftAnswers } from "@/hooks/useEnglishDraftAnswers";
import { useToast } from "@/components/ui/Toast";
import { useJobCenter } from "@/components/jobs/JobCenter";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import { findUnreconciledEnglishLocalHistory, type EnglishTrainingPersistenceMode } from "@/lib/english-training-core";
import {
  buildEnglishSubjectiveGradeBreakdown,
  type EnglishSubjectiveGradeSuggestion,
} from "@/lib/english-subjective-grade";
import {
  ENGLISH_TRAINING_YEARS,
  isEnglishObjectiveSection,
  getEnglishNewTypeKind,
  normalizeEnglishObjectiveAnswer,
  normalizeEnglishTrainingDataScores,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishTrainingData,
} from "@/lib/english-training";
import { mapEnglishImportToTrainingData, type EnglishPaperImport } from "@/lib/english-import-data";
import {
  createEmptyEnglishLedger,
  ENGLISH_GRADE_CONFIRMED_EVENT,
  getEffectiveEnglishRoundResult,
  getEnglishRound,
  getLatestEnglishRoundRevision,
  getPreferredEnglishRound,
  importLegacyEnglishAttempt,
  readEnglishRoundLedgers,
  saveEnglishRoundDraft,
  submitEnglishRoundRevision,
  upsertEnglishRoundLedger,
  writeEnglishRoundLedgers,
  type EnglishPassageRoundLedger,
  type EnglishRoundGrade,
} from "@/lib/english-round-history";
import { EnglishPracticeWorkspace, getPassageDisplayTitle } from "@/components/tools/EnglishPracticeWorkspace";

type TrainingStage = "types" | "sets" | "practice";
type TrainingCategoryId = "reading" | "minor" | "writing";
type TrainingStatusFilter = "all" | "todo" | "progress" | "done";

type TrainingCategory = {
  id: TrainingCategoryId;
  title: string;
  subtitle: string;
  icon: ReactNode;
};

type EnglishTrainingStats = {
  total: number;
  submitted: number;
  inProgress: number;
  accuracy: number;
};

const TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    id: "reading",
    title: "阅读",
    subtitle: "阅读理解",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "minor",
    title: "三小门",
    subtitle: "完形 / 新题型 / 翻译",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: "writing",
    title: "写作",
    subtitle: "小作文 / 大作文",
    icon: <PenLine className="h-5 w-5" />,
  },
];

function getCategoryForPassage(passage: EnglishPassage): TrainingCategoryId {
  if (passage.section === "reading") return "reading";
  if (passage.section === "writing") return "writing";
  return "minor";
}

function getRoundProgress(
  passageId: string,
  ledgersByPassageId: Map<string, EnglishPassageRoundLedger>,
  attemptsByPassageId: Map<string, EnglishAttempt>,
): { round: 1 | 2 | 3; status: "in_progress" | "submitted" | "sealed" | "abandoned" | "none" } {
  const ledger = ledgersByPassageId.get(passageId);
  if (ledger) {
    const round = getPreferredEnglishRound(ledger);
    const record = getEnglishRound(ledger, round);
    return { round, status: record?.status ?? "none" };
  }

  const attempt = attemptsByPassageId.get(passageId);
  return {
    round: 1,
    status: attempt?.status === "submitted" ? "submitted" : attempt ? "in_progress" : "none",
  };
}

function isCompletedPassage(
  passageId: string,
  ledgersByPassageId: Map<string, EnglishPassageRoundLedger>,
  attemptsByPassageId: Map<string, EnglishAttempt>,
): boolean {
  const progress = getRoundProgress(passageId, ledgersByPassageId, attemptsByPassageId);
  return progress.status === "submitted" || progress.status === "sealed";
}

function buildAnswerMap(attempt?: EnglishAttempt): EnglishAttemptAnswerInput {
  if (!attempt) return {};
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
}

function buildLocalSubjectiveSuggestion(
  passage: EnglishPassage,
  questions: EnglishQuestion[],
  answers: EnglishAttemptAnswerInput,
): EnglishSubjectiveGradeSuggestion {
  const maxScore = questions.reduce((sum, question) => sum + question.score, 0);
  const answered = questions.filter((question) => (answers[question.id] ?? "").trim());
  const score = passage.section === "writing"
    ? (() => {
      const wordCount = (answers[questions[0]?.id ?? ""] ?? "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g)?.length ?? 0;
      return Math.round(Math.min(maxScore, maxScore * Math.min(wordCount / 45, 1)) * 2) / 2;
    })()
    : questions.reduce((sum, question) => {
      const length = (answers[question.id] ?? "").trim().length;
      const ratio = length >= 12 ? 1 : length >= 4 ? 0.5 : 0;
      return sum + question.score * ratio;
    }, 0);
  const roundedScore = Number(Math.min(maxScore, score).toFixed(1));
  const complete = answered.length === questions.length;
  return {
    score: roundedScore,
    maxScore,
    feedback: passage.section === "translation"
      ? `本地审查评分：已填写 ${answered.length}/${questions.length} 题，重点检查信息完整、语义准确和中文表达。`
      : `本地审查评分：当前按词数和作答完整度生成演示建议，正式环境仍使用 DeepSeek 阅卷任务。`,
    strengths: answered.length > 0 ? ["已开始作答，评分链路可以读取当前答案。"] : [],
    issues: complete ? [] : [`还有 ${questions.length - answered.length} 题未填写。`],
    suggestions: passage.section === "translation"
      ? ["逐句核对主干、逻辑关系和术语表达。"]
      : ["补齐任务要求、段落结构和关键表达，再确认正式终分。"],
    confidence: 0.35,
  };
}

function getPassageWindowLabel(passage: EnglishPassage): string {
  if (passage.section === "reading" && passage.passageNo.startsWith("text")) {
    return passage.passageNo.replace("text", "");
  }
  if (passage.passageNo === "small_writing") return "小作文";
  if (passage.passageNo === "big_writing") return "大作文";
  if (passage.section === "cloze") return "完形";
  if (passage.section === "new_type") {
    const kind = getEnglishNewTypeKind(passage.content, passage.title, passage.year);
    return { insertion: "七选五", ordering: "段落排序", heading: "小标题", statement_matching: "观点匹配" }[kind];
  }
  if (passage.section === "translation") return "翻译";
  return "训练";
}

function sortPassagesOldestFirst(left: EnglishPassage, right: EnglishPassage): number {
  return left.year - right.year
    || left.sortOrder - right.sortOrder
    || left.passageNo.localeCompare(right.passageNo);
}

export function EnglishTraining() {
  const { user } = useAdminAuth();
  const reviewMode = useLocalReviewMode();
  if (!user && !reviewMode) return <PageShell width="workspace"><p role="status" className="text-on-surface-variant">正在恢复学习账号…</p></PageShell>;
  return <EnglishTrainingWorkspace key={user?.id ?? "local-review"} userId={user?.id ?? null} reviewMode={reviewMode} />;
}

function filterEnglishTrainingWindow(data: EnglishTrainingData): EnglishTrainingData {
  const allowedYears = new Set(ENGLISH_TRAINING_YEARS);
  const passages = data.passages.filter((passage) => allowedYears.has(passage.year));
  const passageIds = new Set(passages.map((passage) => passage.id));
  return normalizeEnglishTrainingDataScores({
    papers: data.papers.filter((paper) => allowedYears.has(paper.year)),
    passages,
    questions: data.questions.filter((question) => passageIds.has(question.passageId)),
    attempts: data.attempts.filter((attempt) => passageIds.has(attempt.passageId)),
  });
}

function EnglishTrainingWorkspace({ userId, reviewMode }: { userId: string | null; reviewMode: boolean }) {
  const toast = useToast();
  const {
    jobs,
    claimJobResult,
    createEnglishSubjectiveGradeJob,
    createLocalJob,
    loadJobResult,
    updateJob,
  } = useJobCenter();
  const [data, setData] = useState<EnglishTrainingData>({
    papers: [],
    passages: [],
    questions: [],
    attempts: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<TrainingStage>("types");
  const [activeCategoryId, setActiveCategoryId] = useState<TrainingCategoryId | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const draftOwnerId = userId ?? (reviewMode ? "__local-review__" : null);
  const { answers: draftAnswersByPassageId, setAnswers: setDraftAnswersByPassageId } = useEnglishDraftAnswers(draftOwnerId);
  const [roundLedgers, setRoundLedgers] = useState<EnglishPassageRoundLedger[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<EnglishTrainingPersistenceMode>("legacy");
  const [editingSubmittedRoundKey, setEditingSubmittedRoundKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "submit" | null>(null);
  const [subjectiveBusy, setSubjectiveBusy] = useState<"suggest" | "confirm" | null>(null);
  const [routeApplied, setRouteApplied] = useState(false);
  const restoredSubjectiveJobIds = useRef(new Set<string>());

  useEffect(() => {
    const onConfirmed = (event: Event) => {
      const result = (event as CustomEvent<{ mode: EnglishTrainingPersistenceMode; ledgers: EnglishPassageRoundLedger[] }>).detail;
      if (!result || !Array.isArray(result.ledgers)) return;
      setPersistenceMode(result.mode);
      setRoundLedgers((current) => result.ledgers.reduce((next, ledger) => upsertEnglishRoundLedger(next, ledger), current));
    };
    window.addEventListener(ENGLISH_GRADE_CONFIRMED_EVENT, onConfirmed);
    return () => window.removeEventListener(ENGLISH_GRADE_CONFIRMED_EVENT, onConfirmed);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        if (reviewMode) {
          const response = await fetch("/api/english/review-data", { cache: "no-store" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "完整真题加载失败");
          if (cancelled) return;
          setData(filterEnglishTrainingWindow(mapEnglishImportToTrainingData(payload as { papers: EnglishPaperImport[] })));
          setPersistenceMode("legacy");
          setRoundLedgers(readEnglishRoundLedgers());
          toast.info("六年真题已载入，预览作答仅保存在本机。");
          return;
        }
        const [trainingData, roundHistory] = await Promise.all([
          englishTrainingApi.getTrainingData(),
          englishTrainingApi.getRoundHistory(),
        ]);
        if (cancelled) return;
        const scopedTrainingData = filterEnglishTrainingWindow(trainingData);
        setData(scopedTrainingData);
        setPersistenceMode(roundHistory.mode);
        const stored = readEnglishRoundLedgers();
        if (roundHistory.mode !== "legacy") {
          const unreconciled = findUnreconciledEnglishLocalHistory(stored, roundHistory.ledgers);
          if (unreconciled.length > 0) {
            const passageCount = new Set(unreconciled.map((issue) => issue.passageId)).size;
            throw new Error(`检测到 ${passageCount} 个题组存在尚未同步的本机训练历史。为避免覆盖，需先完成本机历史迁移确认。`);
          }
        }
        const imported = roundHistory.mode === "legacy"
          ? scopedTrainingData.attempts.reduce((ledgers, attempt) => {
            const existing = ledgers.find((ledger) => ledger.passageId === attempt.passageId);
            const ledger = importLegacyEnglishAttempt(existing, {
              passageId: attempt.passageId,
              status: attempt.status,
              answers: buildAnswerMap(attempt),
              score: attempt.score,
              maxScore: attempt.maxScore,
              startedAt: attempt.startedAt.toISOString(),
              submittedAt: attempt.submittedAt?.toISOString(),
              updatedAt: attempt.updatedAt.toISOString(),
            });
            return upsertEnglishRoundLedger(ledgers, ledger);
          }, stored)
          : roundHistory.ledgers;
        setRoundLedgers(imported);
        if (roundHistory.mode === "legacy" && JSON.stringify(imported) !== JSON.stringify(stored)) {
          writeEnglishRoundLedgers(imported);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        if (reviewMode) {
          setLoadError(message);
        } else {
          setLoadError(message);
          toast.error(`英语真题加载失败：${message}`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTrainingData();
    return () => {
      cancelled = true;
    };
  }, [reviewMode, toast]);

  const attemptsByPassageId = useMemo(
    () => new Map(data.attempts.map((attempt) => [attempt.passageId, attempt])),
    [data.attempts],
  );

  const ledgersByPassageId = useMemo(
    () => new Map(roundLedgers.map((ledger) => [ledger.passageId, ledger])),
    [roundLedgers],
  );

  const questionsByPassageId = useMemo(() => {
    const map = new Map<string, EnglishQuestion[]>();
    for (const question of data.questions) {
      const current = map.get(question.passageId) ?? [];
      current.push(question);
      map.set(question.passageId, current);
    }
    for (const list of map.values()) {
      list.sort((left, right) => left.sortOrder - right.sortOrder || left.questionNo.localeCompare(right.questionNo));
    }
    return map;
  }, [data.questions]);

  const passagesByCategory = useMemo(() => {
    const map = new Map<TrainingCategoryId, EnglishPassage[]>();
    for (const category of TRAINING_CATEGORIES) {
      map.set(category.id, []);
    }
    for (const passage of data.passages) {
      const categoryId = getCategoryForPassage(passage);
      map.get(categoryId)?.push(passage);
    }
    for (const passages of map.values()) {
      passages.sort(sortPassagesOldestFirst);
    }
    return map;
  }, [data.passages]);

  const stats = useMemo(() => {
    const effectiveResults = roundLedgers.flatMap((ledger) => getEffectiveEnglishRoundResult(ledger) ?? []);
    const score = effectiveResults.reduce((sum, result) => sum + result.revision.score, 0);
    const maxScore = effectiveResults.reduce((sum, result) => sum + result.revision.maxScore, 0);
    return {
      total: data.passages.length,
      submitted: effectiveResults.length,
      inProgress: roundLedgers.filter((ledger) => ledger.rounds.some((round) => round.status === "in_progress")).length,
      accuracy: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    };
  }, [data.passages.length, roundLedgers]);

  const activeCategory = useMemo(
    () => TRAINING_CATEGORIES.find((category) => category.id === activeCategoryId) ?? null,
    [activeCategoryId],
  );

  const categoryPassages = activeCategoryId ? passagesByCategory.get(activeCategoryId) ?? [] : [];
  const activePassage = activePassageId
    ? data.passages.find((passage) => passage.id === activePassageId) ?? null
    : null;
  const activeAttempt = activePassage ? attemptsByPassageId.get(activePassage.id) : undefined;
  const activeQuestions = activePassage ? questionsByPassageId.get(activePassage.id) ?? [] : [];
  const activeLedger = activePassage ? ledgersByPassageId.get(activePassage.id) : undefined;
  const activeRoundNo = 1 as const;
  const activeRound = getEnglishRound(activeLedger, activeRoundNo);
  const activeRoundRevision = getLatestEnglishRoundRevision(activeRound);
  const activeRoundKey = activePassage ? `${activePassage.id}:${activeRoundNo}` : "";
  const activeAnswers = activePassage
    ? draftAnswersByPassageId[activeRoundKey]
      ?? ((activeRound?.status === "submitted" || activeRound?.status === "sealed") && editingSubmittedRoundKey !== activeRoundKey
        ? activeRoundRevision?.answers
        : activeRound?.draftAnswers)
      ?? activeRoundRevision?.answers
      ?? activeRound?.draftAnswers
      ?? (activeRoundNo === 1 ? buildAnswerMap(activeAttempt) : {})
    : {};
  const activeSubjectiveGradeJob = jobs.find((job) => (
    job.type === "english_subjective_grade"
    && job.targetId === `english-round:${activePassage?.id ?? "none"}:${activeRoundNo}`
    && (job.status === "queued" || job.status === "running" || job.status === "waiting_for_trigger")
  ));
  const effectiveSubjectiveBusy = activeSubjectiveGradeJob ? "suggest" : subjectiveBusy;

  useEffect(() => {
    const completedJob = jobs.find((job) => (
      job.type === "english_subjective_grade"
      && job.status === "succeeded"
      && !job.resultClaimedAt
      && !restoredSubjectiveJobIds.current.has(job.id)
    ));
    if (!completedJob) return;
    if (!completedJob.resultPayload) {
      void loadJobResult(completedJob.id);
      return;
    }
    const result = completedJob.resultPayload && typeof completedJob.resultPayload === "object" && !Array.isArray(completedJob.resultPayload)
      ? completedJob.resultPayload as Record<string, unknown>
      : {};
    const passageId = typeof result.passageId === "string" ? result.passageId : "";
    const round = Number(result.round);
    const ledgers = Array.isArray(result.ledgers) ? result.ledgers as EnglishPassageRoundLedger[] : [];
    const serverLedger = ledgers.find((ledger) => ledger.passageId === passageId);
    if (!serverLedger || !Number.isInteger(round) || round < 1 || round > 3) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled || restoredSubjectiveJobIds.current.has(completedJob.id)) return;
      restoredSubjectiveJobIds.current.add(completedJob.id);
      setPersistenceMode(result.mode === "dual" ? "dual" : "shared");
      setRoundLedgers((current) => upsertEnglishRoundLedger(current, serverLedger));
      setDraftAnswersByPassageId((current) => {
        const next = { ...current };
        delete next[`${passageId}:${round}`];
        return next;
      });
      setEditingSubmittedRoundKey(null);
      const tokensUsed = Number(result.tokensUsed);
      if (Number.isFinite(tokensUsed) && tokensUsed > 0) recordDeepSeekUsage(tokensUsed);
      claimJobResult(completedJob.id);
      toast.success("已恢复 AI 建议，请核对并确认终分");
    })();
    return () => { cancelled = true; };
  }, [claimJobResult, jobs, loadJobResult, setDraftAnswersByPassageId, toast]);

  const persistLedger = (ledger: EnglishPassageRoundLedger, writeLocal = persistenceMode === "legacy") => {
    setRoundLedgers((current) => {
      const next = upsertEnglishRoundLedger(current, ledger);
      if (writeLocal) writeEnglishRoundLedgers(next);
      return next;
    });
  };

  useEffect(() => {
    if (routeApplied || isLoading || data.passages.length === 0 || typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const passageId = params.get("passage");
      if (!passageId) {
        setRouteApplied(true);
        return;
      }

      const passage = data.passages.find((item) => item.id === passageId);
      if (!passage) {
        setRouteApplied(true);
        return;
      }

      setActiveCategoryId(getCategoryForPassage(passage));
      setActivePassageId(passage.id);
      setEditingSubmittedRoundKey(params.get("edit") === "1" ? `${passage.id}:1` : null);
      setStage("practice");

      setRouteApplied(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data.passages, isLoading, ledgersByPassageId, routeApplied]);

  const handleSelectCategory = (categoryId: TrainingCategoryId) => {
    setActiveCategoryId(categoryId);
    setStage("sets");
  };

  const handleOpenPassage = (passageId: string) => {
    let ledger = ledgersByPassageId.get(passageId);
    if (!ledger) {
      ledger = createEmptyEnglishLedger(passageId, new Date().toISOString());
      persistLedger(ledger);
    }
    setActivePassageId(passageId);
    setEditingSubmittedRoundKey(null);
    setStage("practice");
  };

  const handleBack = () => {
    if (stage === "practice") {
      setStage("sets");
      setEditingSubmittedRoundKey(null);
      return;
    }
    if (stage === "sets") {
      setStage("types");
      setActiveCategoryId(null);
    }
  };

  const handleResetQuestion = (questionId: string) => {
    if (!activePassage || saving || effectiveSubjectiveBusy || !activeQuestions.some((question) => question.id === questionId)) return;
    if (activeRoundRevision) setEditingSubmittedRoundKey(activeRoundKey);
    setDraftAnswersByPassageId((current) => ({
      ...current,
      [activeRoundKey]: {
        ...(current[activeRoundKey] ?? activeAnswers),
        [questionId]: "",
      },
    }));
    toast.info("已清空当前题，其他作答保留");
  };

  const handleResetPassage = () => {
    if (!activePassage || saving || effectiveSubjectiveBusy) return;
    const now = new Date().toISOString();
    if (activeRoundRevision) {
      setEditingSubmittedRoundKey(activeRoundKey);
      setDraftAnswersByPassageId((current) => ({ ...current, [activeRoundKey]: {} }));
    toast.info("已清空当前作答和批改结果，历史结果仍保留，可从该题组重新编辑");
      return;
    }

    const ledger = activeLedger ?? createEmptyEnglishLedger(activePassage.id, now);
    const clearedLedger = saveEnglishRoundDraft(ledger, activeRoundNo, {}, now);
    persistLedger(clearedLedger, true);
    setDraftAnswersByPassageId((current) => {
      const next = { ...current };
      delete next[activeRoundKey];
      return next;
    });
    toast.info("已清空当前题组作答");
  };

  const handleSaveAttempt = async (submitted: boolean) => {
    if (!activePassage || saving) return;
    const now = new Date().toISOString();
    const ledger = activeLedger ?? createEmptyEnglishLedger(activePassage.id, now);
    const round = getEnglishRound(ledger, activeRoundNo);
    if (!round) {
      toast.error("当前训练记录尚未建立。");
      return;
    }
    const updatingSubmittedResult = submitted && round.revisions.length > 0;
    setSaving(submitted ? "submit" : "save");
    try {
      let nextLedger: EnglishPassageRoundLedger;
      let nextMode = persistenceMode;
      if (reviewMode) {
        if (submitted) {
          const score = isEnglishObjectiveSection(activePassage.section)
            ? activeQuestions.reduce((sum, question) => (
              sum + (normalizeEnglishObjectiveAnswer(activeAnswers[question.id] ?? "") === normalizeEnglishObjectiveAnswer(question.standardAnswer) ? question.score : 0)
            ), 0)
            : 0;
          nextLedger = submitEnglishRoundRevision(ledger, activeRoundNo, {
            answers: activeAnswers,
            score,
            maxScore: activePassage.totalScore,
            gradeOrigin: isEnglishObjectiveSection(activePassage.section) ? "system_scored" : "user_final",
            now,
          });
        } else {
          nextLedger = saveEnglishRoundDraft(ledger, activeRoundNo, activeAnswers, now);
        }
      } else if (submitted) {
        const result = await englishTrainingApi.saveAttempt({
          passage: activePassage,
          answers: activeAnswers,
          round: activeRoundNo,
          action: "submit",
        });
        nextMode = result.mode;
        setPersistenceMode(result.mode);
        if (result.attempt) {
          const saved = result.attempt;
          setData((current) => ({
            ...current,
            attempts: [saved, ...current.attempts.filter((attempt) => attempt.id !== saved.id && attempt.passageId !== saved.passageId)],
          }));
        }
        if (result.mode === "legacy") {
          if (!result.attempt) throw new Error("旧训练路径没有返回保存结果");
          nextLedger = submitEnglishRoundRevision(ledger, activeRoundNo, {
            answers: activeAnswers,
            score: result.attempt.score,
            maxScore: result.attempt.maxScore,
            gradeOrigin: isEnglishObjectiveSection(activePassage.section) ? "system_scored" : "user_final",
            now,
          });
        } else {
          const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
          if (!serverLedger) throw new Error("共享训练核未返回当前题组历史");
          nextLedger = serverLedger;
        }
      } else {
        const shouldPersistRemotely = persistenceMode !== "legacy"
          || (activeRoundNo === 1 && activeAttempt?.status !== "submitted");
        if (shouldPersistRemotely) {
          const result = await englishTrainingApi.saveAttempt({
            passage: activePassage,
            answers: activeAnswers,
            round: activeRoundNo,
            action: "save_draft",
          });
          nextMode = result.mode;
          setPersistenceMode(result.mode);
          if (result.attempt) {
            const saved = result.attempt;
            setData((current) => ({
              ...current,
              attempts: [saved, ...current.attempts.filter((attempt) => attempt.id !== saved.id && attempt.passageId !== saved.passageId)],
            }));
          }
          if (result.mode !== "legacy") {
            const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
            if (!serverLedger) throw new Error("共享训练核未返回当前题组草稿");
            nextLedger = serverLedger;
          } else {
            nextLedger = saveEnglishRoundDraft(ledger, activeRoundNo, activeAnswers, now);
          }
        } else {
          nextLedger = saveEnglishRoundDraft(ledger, activeRoundNo, activeAnswers, now);
        }
      }
      persistLedger(nextLedger, nextMode === "legacy");
      setDraftAnswersByPassageId((current) => {
        const next = { ...current };
        delete next[activeRoundKey];
        return next;
      });
      if (submitted) setEditingSubmittedRoundKey(null);
      toast.success(reviewMode
        ? "审查模式已保存本机训练状态"
        : updatingSubmittedResult
            ? "已更新正式结果"
            : submitted
              ? "已提交当前题组"
              : "已保存作答草稿");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`${submitted ? "提交" : "保存"}失败：${message}`);
    } finally {
      setSaving(null);
    }
  };

  const handleStartEditingSubmittedAttempt = () => {
    if (!activePassage || !activeRoundRevision) return;
    setDraftAnswersByPassageId((current) => ({
      ...current,
      [activeRoundKey]: activeRoundRevision.answers,
    }));
    setEditingSubmittedRoundKey(activeRoundKey);
  };

  const handleCancelEditingSubmittedAttempt = () => {
    if (!activePassage) return;
    setDraftAnswersByPassageId((current) => {
      const next = { ...current };
      delete next[activeRoundKey];
      return next;
    });
    setEditingSubmittedRoundKey(null);
  };

  const handleRequestSubjectiveSuggestion = async () => {
    if (!activePassage || effectiveSubjectiveBusy || saving) return;
    if (!Object.values(activeAnswers).some((answer) => answer.trim())) {
      toast.error("请先填写作答，再获取 AI 建议。");
      return;
    }

    if (reviewMode) {
      setSubjectiveBusy("suggest");
      const localJob = createLocalJob({
        type: "english_subjective_grade",
        title: `${getPassageDisplayTitle(activePassage)} · AI 建议评分`,
        targetId: `english-round:${activePassage.id}:${activeRoundNo}`,
        progressTotal: 2,
        statusText: "本地审查任务已登记，正在整理作答内容",
      });
      try {
        updateJob(localJob.id, {
          status: "running",
          phase: "正在整理作答",
          statusText: "正在整理本轮主观题作答，任务中心会保留进度",
          progress: 50,
          progressCurrent: 1,
        });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
        const now = new Date().toISOString();
        const ledger = activeLedger ?? createEmptyEnglishLedger(activePassage.id, now);
        const suggestion = buildLocalSubjectiveSuggestion(activePassage, activeQuestions, activeAnswers);
        const grade: EnglishRoundGrade = {
          id: `review-grade-${Date.now()}`,
          origin: "ai_suggested",
          gradeSeq: 1,
          score: suggestion.score,
          maxScore: suggestion.maxScore,
          feedback: suggestion.feedback,
          breakdown: buildEnglishSubjectiveGradeBreakdown(suggestion),
          createdAt: now,
        };
        const nextLedger = submitEnglishRoundRevision(ledger, activeRoundNo, {
          answers: activeAnswers,
          score: suggestion.score,
          maxScore: suggestion.maxScore,
          gradeOrigin: "ai_suggested",
          grades: [grade],
          now,
        });
        updateJob(localJob.id, {
          status: "succeeded",
          phase: "结果待领取",
          statusText: "AI 建议已生成，请回到题目核对并确认正式终分",
          progress: 100,
          progressCurrent: 2,
          resultPayload: {
            mode: "legacy",
            passageId: activePassage.id,
            round: activeRoundNo,
            ledgers: [nextLedger],
            tokensUsed: 0,
          },
        });
        toast.info("批改任务已完成，请在题目页核对并确认正式终分");
      } catch (error) {
        updateJob(localJob.id, {
          status: "failed",
          phase: "处理失败",
          statusText: "本地审查批改任务未能完成",
          error: error instanceof Error ? error.message : "本地演示批改失败",
        });
        toast.error(error instanceof Error ? error.message : "本地演示批改失败");
      } finally {
        setSubjectiveBusy(null);
      }
      return;
    }

    if (persistenceMode === "legacy") {
      toast.error("主观题确认流需先完成共享训练核迁移。");
      return;
    }

    try {
      await createEnglishSubjectiveGradeJob({
        passageId: activePassage.id,
        round: activeRoundNo,
        answers: activeAnswers,
      });
      toast.info("主观题建议评分已并入任务中心；切换页面不会丢失，也可以随时取消");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主观题建议评分任务创建失败");
    }
  };

  const handleConfirmSubjectiveGrade = async (
    revisionId: string,
    score: number,
    feedback: string,
    suggestion: EnglishSubjectiveGradeSuggestion,
  ) => {
    if (!activePassage || effectiveSubjectiveBusy || saving) return;
    setSubjectiveBusy("confirm");
    try {
      if (reviewMode) {
        const now = new Date().toISOString();
        const ledger = activeLedger;
        if (!ledger) throw new Error("本地演示没有找到当前题组轮次");
        const nextLedger = submitEnglishRoundRevision(ledger, activeRoundNo, {
          answers: activeAnswers,
          score,
          maxScore: suggestion.maxScore,
          gradeOrigin: "user_final",
          grades: [{
            id: `review-final-${Date.now()}`,
            origin: "user_final",
            gradeSeq: 2,
            score,
            maxScore: suggestion.maxScore,
            feedback,
            breakdown: buildEnglishSubjectiveGradeBreakdown({ ...suggestion, score, feedback }),
            createdAt: now,
          }],
          now,
        });
        persistLedger(nextLedger, true);
        toast.success("本地演示正式终分已确认");
        return;
      }
      const result = await englishTrainingApi.confirmSubjectiveGrade({
        passage: activePassage,
        revisionId,
        score,
        feedback,
        suggestion,
      });
      setPersistenceMode(result.mode);
      const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
      if (!serverLedger) throw new Error("共享训练核未返回主观题终分记录");
      persistLedger(serverLedger, false);
      toast.success("正式终分已确认");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主观题终分确认失败");
    } finally {
      setSubjectiveBusy(null);
    }
  };

  const workspace = (
    <AnimatePresence initial={false} mode="wait">
    <TrainingStagePanel key={`${stage}:${stage === "practice" ? activePassage?.id : activeCategoryId ?? ""}`}>
      {stage === "types" && (
        <TrainingTypeSelect
          loading={isLoading}
          error={loadError}
          stats={stats}
          onSelect={handleSelectCategory}
        />
      )}
      {stage === "sets" && activeCategory && (
          <TrainingSetList
            category={activeCategory}
            passages={categoryPassages}
            attemptsByPassageId={attemptsByPassageId}
            ledgersByPassageId={ledgersByPassageId}
            loading={isLoading}
            error={loadError}
            onBack={handleBack}
          onSelect={handleOpenPassage}
        />
      )}
      {stage === "practice" && (
        <EnglishPracticeWorkspace
          key={activePassage?.id ?? "empty-practice"}
          passage={activePassage}
          questions={activeQuestions}
          attempt={activeAttempt}
          roundRecord={activeRound}
          roundRevision={activeRoundRevision}
          editingSubmitted={editingSubmittedRoundKey === activeRoundKey || Boolean(draftAnswersByPassageId[activeRoundKey] && activeRoundRevision)}
          answers={activeAnswers}
          saving={saving}
          subjectiveBusy={effectiveSubjectiveBusy}
          persistenceMode={persistenceMode}
          reviewMode={reviewMode}
          loading={isLoading}
           directScoreMode={false}
           onDirectScoreChange={() => undefined}
          onBack={handleBack}
          onAnswerChange={(questionId, answer) => {
            if (!activePassage) return;
            setDraftAnswersByPassageId((current) => ({
              ...current,
              [activeRoundKey]: {
                ...(current[activeRoundKey] ?? activeAnswers),
                [questionId]: answer,
              },
            }));
          }}
          onResetQuestion={handleResetQuestion}
          onResetPassage={handleResetPassage}
          onStartEditingSubmitted={handleStartEditingSubmittedAttempt}
          onCancelEditingSubmitted={handleCancelEditingSubmittedAttempt}
          onSave={() => handleSaveAttempt(false)}
           onSubmit={() => activePassage && isEnglishObjectiveSection(activePassage.section)
               ? handleSaveAttempt(true)
               : handleRequestSubjectiveSuggestion()}
          onConfirmSubjectiveGrade={handleConfirmSubjectiveGrade}
        />
      )}
    </TrainingStagePanel>
    </AnimatePresence>
  );

  return (
    <>
      {stage !== "practice" && (
        <PageHeader
          width="workspace"
          eyebrow="英语一"
          icon={<BookOpen className="h-4 w-4" />}
          title="英语真题训练"
          description="按阅读、三小门和写作整理 2021-2026 英语一真题。"
          actions={(
            <Link href="/tools" className="control-button h-10 px-3 text-sm">
              <ArrowLeft className="h-4 w-4" />
              返回工具
            </Link>
          )}
          stats={[
            { label: "题组", value: stats.total },
            { label: "已提交", value: stats.submitted, tone: "text-green-600" },
            { label: "进行中", value: stats.inProgress },
            { label: "正确率", value: `${stats.accuracy}%` },
          ]}
        />
      )}
      <PageShell
        width="workspace"
        topPadding={stage === "practice" ? "none" : "content"}
        className={stage === "practice" ? "english-practice-page" : ""}
      >
        {reviewMode && stage !== "practice" && <p role="status" className="mb-4 text-sm text-on-surface-variant">本机交互预览，作答仅保存在本机。</p>}
        {workspace}
      </PageShell>
    </>
  );
}

function TrainingStagePanel({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.section
      className="english-training-flow min-w-0"
      data-reduced-motion={reducedMotion}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      variants={subtleSurfaceMotion}
      initial={reducedMotion ? false : "initial"}
      animate="animate"
      exit="exit"
      transition={{ duration: reducedMotion ? 0 : uiMotion.duration.fast, ease: uiMotion.ease.standard }}
    >{children}</motion.section>
  );
}

function TrainingTypeSelect({
  loading,
  error,
  stats,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  stats: EnglishTrainingStats;
  onSelect: (categoryId: TrainingCategoryId) => void;
}) {
  if (loading) {
    return <EmptyWorkspace icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载英语真题训练。" />;
  }

  if (error) {
    return <EmptyWorkspace text={error} />;
  }

  if (stats.total === 0) {
    return <EmptyWorkspace icon={<Sparkles className="h-8 w-8 text-primary" />} text="英语一真题库还未导入。" />;
  }

  return (
    <section className="space-y-4">
      <div className="mx-auto grid max-w-4xl gap-3">
        {TRAINING_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className="surface-card group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {category.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-on-surface sm:text-xl">{category.title}</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{category.subtitle}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center text-primary">
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TrainingSetList({
  category,
  passages,
  attemptsByPassageId,
  ledgersByPassageId,
  loading,
  error,
  onBack,
  onSelect,
}: {
  category: TrainingCategory;
  passages: EnglishPassage[];
  attemptsByPassageId: Map<string, EnglishAttempt>;
  ledgersByPassageId: Map<string, EnglishPassageRoundLedger>;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onSelect: (passageId: string) => void;
}) {
  const [yearQuery, setYearQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TrainingStatusFilter>("all");

  const yearGroups = useMemo(() => {
    const groups = new Map<number, EnglishPassage[]>();
    for (const passage of passages) {
      const current = groups.get(passage.year) ?? [];
      current.push(passage);
      groups.set(passage.year, current);
    }
    return Array.from(groups.entries())
      .map(([year, groupPassages]) => {
        const sortedPassages = [...groupPassages].sort((left, right) => {
          const leftCompleted = isCompletedPassage(left.id, ledgersByPassageId, attemptsByPassageId);
          const rightCompleted = isCompletedPassage(right.id, ledgersByPassageId, attemptsByPassageId);
          if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;
          return sortPassagesOldestFirst(left, right);
        });
        return {
          year,
          passages: sortedPassages,
          completed: sortedPassages.length > 0 && sortedPassages.every((passage) => isCompletedPassage(passage.id, ledgersByPassageId, attemptsByPassageId)),
        };
      })
      .sort((left, right) => {
        if (left.completed !== right.completed) return left.completed ? 1 : -1;
        return left.year - right.year;
      });
  }, [attemptsByPassageId, ledgersByPassageId, passages]);

  const filteredYearGroups = useMemo(() => {
    const normalizedQuery = yearQuery.trim();
    return yearGroups
      .map((group) => ({
        ...group,
        passages: group.passages.filter((passage) => {
          const progress = getRoundProgress(passage.id, ledgersByPassageId, attemptsByPassageId);
          const matchesQuery = !normalizedQuery || String(group.year).includes(normalizedQuery);
          const matchesStatus = statusFilter === "all"
            || (statusFilter === "todo" && progress.status === "none")
            || (statusFilter === "progress" && progress.status === "in_progress")
            || (statusFilter === "done" && (progress.status === "submitted" || progress.status === "sealed"));
          return matchesQuery && matchesStatus;
        }),
      }))
      .filter((group) => group.passages.length > 0);
  }, [attemptsByPassageId, ledgersByPassageId, statusFilter, yearGroups, yearQuery]);

  return (
    <section className="space-y-4">
      <div className="surface-panel p-4 sm:p-5">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="control-button mb-4 h-9 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回题型
          </button>
          <h2 className="text-2xl font-bold text-on-surface">{category.title}</h2>
        </div>
      </div>

      <section className="surface-panel p-4 sm:p-5">
        {loading ? (
          <InlineState icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />} text="加载题组..." />
        ) : error ? (
          <InlineState text={error} tone="text-red-600" />
        ) : yearGroups.length === 0 ? (
          <InlineState text="还没有可用题组。" />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 border-b border-outline-variant/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative min-w-0 sm:w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  value={yearQuery}
                  onChange={(event) => setYearQuery(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="搜索年份"
                  aria-label="搜索年份"
                  className="field-control h-10 w-full pl-9 pr-3 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2" aria-label="题组状态筛选">
                {([
                  ["all", "全部"],
                  ["todo", "未开始"],
                  ["progress", "作答中"],
                  ["done", "已完成"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                    className={`control-button h-10 px-3 text-sm ${statusFilter === value ? "control-button-selected" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {filteredYearGroups.length === 0 ? (
              <InlineState text="没有匹配的题组，请调整年份或状态筛选。" />
            ) : (
              <div className="grid gap-3">
                {filteredYearGroups.map((group) => (
                  <div
                    key={group.year}
                    className={`flex flex-col gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                      group.completed ? "opacity-50" : ""
                    }`}
                  >
                    <div className="text-2xl font-bold tabular-nums text-on-surface">{group.year}</div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {group.passages.map((passage) => {
                        const progress = getRoundProgress(passage.id, ledgersByPassageId, attemptsByPassageId);
                        const submitted = progress.status === "submitted" || progress.status === "sealed";
                        return (
                          <button
                            key={passage.id}
                            type="button"
                            onClick={() => onSelect(passage.id)}
                            aria-label={getPassageDisplayTitle(passage)}
                            className={`english-year-choice ${submitted ? "english-year-choice-submitted" : ""}`}
                          >
                            {getPassageWindowLabel(passage)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function EmptyWorkspace({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <section className="surface-panel flex min-h-[32rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-on-surface-variant">
      {icon ?? <ClipboardCheck className="h-8 w-8 opacity-50" />}
      <p>{text}</p>
    </section>
  );
}

function InlineState({
  icon,
  text,
  tone = "text-on-surface-variant",
}: {
  icon?: ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <div className={`flex items-center gap-2 py-4 text-sm ${tone}`}>
      {icon ?? <Circle className="h-3 w-3 opacity-50" />}
      <span>{text}</span>
    </div>
  );
}
