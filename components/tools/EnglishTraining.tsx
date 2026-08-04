"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  PenLine,
  Sparkles,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import { encodeEnglishManualScore, parseEnglishManualScore } from "@/lib/english-scoring";
import { findUnreconciledEnglishLocalHistory, type EnglishTrainingPersistenceMode } from "@/lib/english-training-core";
import type { EnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";
import {
  isEnglishObjectiveSection,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishTrainingData,
} from "@/lib/english-training";
import {
  createEmptyEnglishLedger,
  getEffectiveEnglishRoundResult,
  getEnglishRound,
  getLatestEnglishRoundRevision,
  getPreferredEnglishRound,
  importLegacyEnglishAttempt,
  readEnglishRoundLedgers,
  saveEnglishRoundDraft,
  startNextEnglishRound,
  submitEnglishRoundRevision,
  upsertEnglishRoundLedger,
  writeEnglishRoundLedgers,
  type EnglishPassageRoundLedger,
} from "@/lib/english-round-history";
import { EnglishPracticeWorkspace, getPassageDisplayTitle } from "@/components/tools/EnglishPracticeWorkspace";

type TrainingStage = "types" | "sets" | "practice";
type TrainingCategoryId = "reading" | "minor" | "writing";

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

function isSubmittedAttempt(attempt?: EnglishAttempt): boolean {
  return attempt?.status === "submitted";
}

function buildAnswerMap(attempt?: EnglishAttempt): EnglishAttemptAnswerInput {
  if (!attempt) return {};
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
}

function getPassageWindowLabel(passage: EnglishPassage): string {
  if (passage.section === "reading" && passage.passageNo.startsWith("text")) {
    return passage.passageNo.replace("text", "");
  }
  if (passage.passageNo === "small_writing") return "小作文";
  if (passage.passageNo === "big_writing") return "大作文";
  if (passage.section === "cloze") return "完形";
  if (passage.section === "new_type") return "新题型";
  if (passage.section === "translation") return "翻译";
  return "训练";
}

function sortPassagesOldestFirst(left: EnglishPassage, right: EnglishPassage): number {
  return left.year - right.year
    || left.sortOrder - right.sortOrder
    || left.passageNo.localeCompare(right.passageNo);
}

function sortPassagesForWindow(
  passages: EnglishPassage[],
  attemptsByPassageId: Map<string, EnglishAttempt>,
): EnglishPassage[] {
  return [...passages].sort((left, right) => {
    const leftSubmitted = isSubmittedAttempt(attemptsByPassageId.get(left.id));
    const rightSubmitted = isSubmittedAttempt(attemptsByPassageId.get(right.id));
    if (leftSubmitted !== rightSubmitted) return leftSubmitted ? 1 : -1;
    return sortPassagesOldestFirst(left, right);
  });
}

export function EnglishTraining() {
  const toast = useToast();
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
  const [draftAnswersByPassageId, setDraftAnswersByPassageId] = useState<Record<string, EnglishAttemptAnswerInput>>({});
  const [roundLedgers, setRoundLedgers] = useState<EnglishPassageRoundLedger[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<EnglishTrainingPersistenceMode>("legacy");
  const [activeRoundByPassageId, setActiveRoundByPassageId] = useState<Record<string, 1 | 2 | 3>>({});
  const [editingSubmittedRoundKey, setEditingSubmittedRoundKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "submit" | null>(null);
  const [startingNext, setStartingNext] = useState(false);
  const [subjectiveBusy, setSubjectiveBusy] = useState<"suggest" | "confirm" | null>(null);
  const [articlePage, setArticlePage] = useState(0);
  const [directScoreModeByRoundKey, setDirectScoreModeByRoundKey] = useState<Record<string, boolean>>({});
  const [routeApplied, setRouteApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [trainingData, roundHistory] = await Promise.all([
          englishTrainingApi.getTrainingData(),
          englishTrainingApi.getRoundHistory(),
        ]);
        if (cancelled) return;
        setData(trainingData);
        setPersistenceMode(roundHistory.mode);
        const stored = readEnglishRoundLedgers();
        if (roundHistory.mode !== "legacy") {
          const unreconciled = findUnreconciledEnglishLocalHistory(stored, roundHistory.ledgers);
          if (unreconciled.length > 0) {
            const passageCount = new Set(unreconciled.map((issue) => issue.passageId)).size;
            throw new Error(`检测到 ${passageCount} 个题组仍有仅存在于本机的三轮或纠正历史。为避免覆盖，需先完成本机历史迁移确认。`);
          }
        }
        const imported = roundHistory.mode === "legacy"
          ? trainingData.attempts.reduce((ledgers, attempt) => {
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
        setLoadError(message);
        toast.error(`英语真题加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTrainingData();
    return () => {
      cancelled = true;
    };
  }, [toast]);

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
  const activeRoundNo = activePassage
    ? activeRoundByPassageId[activePassage.id] ?? getPreferredEnglishRound(activeLedger)
    : 1;
  const activeRound = getEnglishRound(activeLedger, activeRoundNo);
  const activeRoundRevision = getLatestEnglishRoundRevision(activeRound);
  const activeRoundKey = activePassage ? `${activePassage.id}:${activeRoundNo}` : "";
  const activeAnswers = activePassage
    ? draftAnswersByPassageId[activeRoundKey]
      ?? activeRound?.draftAnswers
      ?? activeRoundRevision?.answers
      ?? (activeRoundNo === 1 ? buildAnswerMap(activeAttempt) : {})
    : {};
  const hasSavedDirectScores = Boolean(activeRoundRevision && Object.values(activeRoundRevision.answers).some((answer) => (
    parseEnglishManualScore(answer, Number.MAX_SAFE_INTEGER) !== null
  )));
  const directScoreMode = directScoreModeByRoundKey[activeRoundKey] ?? hasSavedDirectScores;

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
      const ledger = ledgersByPassageId.get(passage.id);
      const requestedRound = Number(params.get("round"));
      const round = requestedRound >= 1 && requestedRound <= 3 && getEnglishRound(ledger, requestedRound)
        ? requestedRound as 1 | 2 | 3
        : getPreferredEnglishRound(ledger);
      setActiveRoundByPassageId((current) => ({ ...current, [passage.id]: round }));
      setEditingSubmittedRoundKey(params.get("edit") === "1" ? `${passage.id}:${round}` : null);
      setStage("practice");
      setArticlePage(0);

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
    setActiveRoundByPassageId((current) => ({
      ...current,
      [passageId]: getPreferredEnglishRound(ledger),
    }));
    setEditingSubmittedRoundKey(null);
    setArticlePage(0);
    setStage("practice");
  };

  const handleBack = () => {
    if (stage === "practice") {
      setStage("sets");
      setEditingSubmittedRoundKey(null);
      setArticlePage(0);
      return;
    }
    if (stage === "sets") {
      setStage("types");
      setActiveCategoryId(null);
    }
  };

  const handleToggleDirectScore = (enabled: boolean) => {
    if (!activePassage) return;
    setDirectScoreModeByRoundKey((current) => ({ ...current, [activeRoundKey]: enabled }));
    setDraftAnswersByPassageId((current) => {
      const next = { ...current };
      const existing = { ...(current[activeRoundKey] ?? activeAnswers) };
      if (!enabled) {
        for (const question of activeQuestions) {
          if (parseEnglishManualScore(existing[question.id], question.score) !== null) existing[question.id] = "";
        }
      } else {
        for (const question of activeQuestions) {
          if (parseEnglishManualScore(existing[question.id], question.score) === null) existing[question.id] = "";
        }
      }
      next[activeRoundKey] = existing;
      return next;
    });
  };

  const handleDirectScoreChange = (questionId: string, rawValue: string) => {
    if (!activePassage) return;
    const question = activeQuestions.find((item) => item.id === questionId);
    if (!question) return;
    const nextValue = rawValue.trim() === "" ? "" : String(Math.min(question.score, Math.max(0, Number(rawValue))));
    if (nextValue !== "" && !Number.isFinite(Number(nextValue))) return;
    setDraftAnswersByPassageId((current) => ({
      ...current,
      [activeRoundKey]: {
        ...(current[activeRoundKey] ?? activeAnswers),
        [questionId]: nextValue === "" ? "" : encodeEnglishManualScore(Number(nextValue)),
      },
    }));
  };

  const getDirectScores = (): Record<string, number> => Object.fromEntries(activeQuestions.map((question) => [
    question.id,
    parseEnglishManualScore(activeAnswers[question.id], question.score) ?? 0,
  ]));

  const handleSaveAttempt = async (submitted: boolean, manualScores?: Record<string, number>) => {
    if (!activePassage || saving) return;
    const now = new Date().toISOString();
    const ledger = activeLedger ?? createEmptyEnglishLedger(activePassage.id, now);
    const round = getEnglishRound(ledger, activeRoundNo);
    if (!round) {
      toast.error(`第 ${activeRoundNo} 轮尚未建立。`);
      return;
    }
    const updatingSubmittedResult = submitted && round.revisions.length > 0;
    setSaving(submitted ? "submit" : "save");
    try {
      let nextLedger: EnglishPassageRoundLedger;
      let nextMode = persistenceMode;
      if (submitted && manualScores) {
        const result = await englishTrainingApi.saveManualScore({
          passage: activePassage,
          scores: manualScores,
          round: activeRoundNo,
        });
        nextMode = result.mode;
        setPersistenceMode(result.mode);
        if (result.attempt) {
          const saved = result.attempt;
          setData((current) => ({
            ...current,
            attempts: [saved, ...current.attempts.filter((attempt) => attempt.id !== saved.id && attempt.passageId !== saved.passageId)],
          }));
          nextLedger = submitEnglishRoundRevision(ledger, activeRoundNo, {
            answers: activeAnswers,
            score: saved.score,
            maxScore: saved.maxScore,
            gradeOrigin: "user_final",
            now,
          });
        } else {
          const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
          if (!serverLedger) throw new Error("共享训练核未返回直接记分结果");
          nextLedger = serverLedger;
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
      toast.success(manualScores ? `已记录 R${activeRoundNo} 得分` : updatingSubmittedResult ? `已追加 R${activeRoundNo} 纠正记录` : submitted ? `已提交 R${activeRoundNo}` : `已保存 R${activeRoundNo} 草稿`);
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

  const handleSelectRound = (round: 1 | 2 | 3) => {
    if (!activePassage || !getEnglishRound(activeLedger, round)) return;
    setActiveRoundByPassageId((current) => ({ ...current, [activePassage.id]: round }));
    setEditingSubmittedRoundKey(null);
  };

  const handleStartNextRound = async () => {
    if (!activePassage || !activeLedger || startingNext) return;
    setStartingNext(true);
    try {
      let next: EnglishPassageRoundLedger;
      let nextMode = persistenceMode;
      if (persistenceMode === "legacy") {
        next = startNextEnglishRound(activeLedger, new Date().toISOString());
      } else {
        const result = await englishTrainingApi.startNextRound(activePassage, activeRoundNo);
        nextMode = result.mode;
        setPersistenceMode(result.mode);
        const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
        next = result.mode === "legacy"
          ? startNextEnglishRound(activeLedger, new Date().toISOString())
          : serverLedger ?? (() => { throw new Error("共享训练核未返回下一轮"); })();
      }
      const round = getPreferredEnglishRound(next);
      persistLedger(next, nextMode === "legacy");
      setActiveRoundByPassageId((current) => ({ ...current, [activePassage.id]: round }));
      setEditingSubmittedRoundKey(null);
      toast.success(`R${round} 已开始，上一轮已封存`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法开始下一轮");
    } finally {
      setStartingNext(false);
    }
  };

  const handleRequestSubjectiveSuggestion = async () => {
    if (!activePassage || subjectiveBusy || saving || startingNext) return;
    if (persistenceMode === "legacy") {
      toast.error("主观题确认流需先完成共享训练核迁移。");
      return;
    }
    if (!Object.values(activeAnswers).some((answer) => answer.trim())) {
      toast.error("请先填写作答，再获取 AI 建议。");
      return;
    }

    setSubjectiveBusy("suggest");
    try {
      const result = await englishTrainingApi.requestSubjectiveSuggestion({
        passage: activePassage,
        round: activeRoundNo,
        answers: activeAnswers,
      });
      setPersistenceMode(result.mode);
      const serverLedger = result.ledgers.find((item) => item.passageId === activePassage.id);
      if (!serverLedger) throw new Error("共享训练核未返回主观题建议记录");
      persistLedger(serverLedger, false);
      setDraftAnswersByPassageId((current) => {
        const next = { ...current };
        delete next[activeRoundKey];
        return next;
      });
      setEditingSubmittedRoundKey(null);
      toast.success(`已生成 R${activeRoundNo} AI 建议，请核对并确认终分`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主观题建议评分失败");
    } finally {
      setSubjectiveBusy(null);
    }
  };

  const handleConfirmSubjectiveGrade = async (
    revisionId: string,
    score: number,
    feedback: string,
    suggestion: EnglishSubjectiveGradeSuggestion,
  ) => {
    if (!activePassage || subjectiveBusy || saving || startingNext) return;
    setSubjectiveBusy("confirm");
    try {
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
      toast.success(`R${activeRoundNo} 正式终分已确认`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主观题终分确认失败");
    } finally {
      setSubjectiveBusy(null);
    }
  };

  const workspace = (
    <section className="min-w-0">
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
          ledger={activeLedger}
          activeRound={activeRoundNo}
          roundRecord={activeRound}
          roundRevision={activeRoundRevision}
          editingSubmitted={editingSubmittedRoundKey === activeRoundKey}
          answers={activeAnswers}
          saving={saving}
          subjectiveBusy={subjectiveBusy}
          startingNext={startingNext}
          persistenceMode={persistenceMode}
          loading={isLoading}
           articlePage={articlePage}
           onArticlePageChange={setArticlePage}
           directScoreMode={directScoreMode}
           onDirectScoreModeChange={handleToggleDirectScore}
           onDirectScoreChange={handleDirectScoreChange}
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
          onRoundChange={handleSelectRound}
          onStartNextRound={handleStartNextRound}
          onStartEditingSubmitted={handleStartEditingSubmittedAttempt}
          onCancelEditingSubmitted={handleCancelEditingSubmittedAttempt}
          onSave={() => handleSaveAttempt(false)}
           onSubmit={() => directScoreMode
             ? handleSaveAttempt(true, getDirectScores())
             : activePassage && isEnglishObjectiveSection(activePassage.section)
               ? handleSaveAttempt(true)
               : handleRequestSubjectiveSuggestion()}
          onConfirmSubjectiveGrade={handleConfirmSubjectiveGrade}
        />
      )}
    </section>
  );

  return (
    <>
      {stage !== "practice" && (
        <PageHeader
          width="workspace"
          eyebrow="英语一"
          icon={<BookOpen className="h-4 w-4" />}
          title="英语真题训练"
          description="按阅读、三小门和写作整理 2007-2026 英语一真题。"
          actions={(
            <Link href="/tools/past-papers" className="control-button h-10 px-3 text-sm">
              <ArrowLeft className="h-4 w-4" />
              返回真题中心
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
        {workspace}
      </PageShell>
    </>
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
  loading,
  error,
  onBack,
  onSelect,
}: {
  category: TrainingCategory;
  passages: EnglishPassage[];
  attemptsByPassageId: Map<string, EnglishAttempt>;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onSelect: (passageId: string) => void;
}) {
  const yearGroups = useMemo(() => {
    const groups = new Map<number, EnglishPassage[]>();
    for (const passage of passages) {
      const current = groups.get(passage.year) ?? [];
      current.push(passage);
      groups.set(passage.year, current);
    }
    return Array.from(groups.entries())
      .map(([year, groupPassages]) => {
        const sortedPassages = sortPassagesForWindow(groupPassages, attemptsByPassageId);
        return {
          year,
          passages: sortedPassages,
          completed: sortedPassages.length > 0 && sortedPassages.every((passage) => isSubmittedAttempt(attemptsByPassageId.get(passage.id))),
        };
      })
      .sort((left, right) => {
        if (left.completed !== right.completed) return left.completed ? 1 : -1;
        return left.year - right.year;
      });
  }, [attemptsByPassageId, passages]);

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
          <div className="grid gap-3">
            {yearGroups.map((group) => (
              <div
                key={group.year}
                className={`flex flex-col gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  group.completed ? "opacity-50" : ""
                }`}
              >
                <div className="text-2xl font-bold tabular-nums text-on-surface">{group.year}</div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {group.passages.map((passage) => {
                    const submitted = isSubmittedAttempt(attemptsByPassageId.get(passage.id));
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
