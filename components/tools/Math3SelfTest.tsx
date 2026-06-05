"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  Loader2,
  Play,
  Save,
  Sparkles,
  Target,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import {
  createEmptyMath3SelfTestAttempt,
  gradeObjectiveAnswer,
  isObjectiveQuestion,
  math3SelfTestDifficultyMeta,
  math3SelfTestModeMeta,
  math3SelfTestStatusMeta,
  math3SelfTestTypeLabels,
  sumMath3SelfTestScore,
  type Math3SelfTestAttempt,
  type Math3SelfTestDifficulty,
  type Math3SelfTestMode,
  type Math3SelfTestQuestion,
  type Math3SelfTestRecord,
  type Math3SelfTestStepGrade,
  type Math3SelfTestStatus,
} from "@/lib/math3-self-test";
import { math3SelfTestsApi } from "@/lib/supabase";

const MODE_OPTIONS: Math3SelfTestMode[] = ["quick", "full"];
const DIFFICULTY_OPTIONS: Math3SelfTestDifficulty[] = ["comfort", "simulation", "challenge"];

function formatDate(value?: Date): string {
  if (!value) return "未保存";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;
  if (hour > 0) {
    return `${hour}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  }
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function getRemainingSeconds(test: Math3SelfTestRecord | null): number {
  if (!test?.startedAt) return (test?.paper.durationMinutes ?? 0) * 60;
  const elapsedSeconds = Math.floor((Date.now() - test.startedAt.getTime()) / 1000);
  return test.paper.durationMinutes * 60 - elapsedSeconds;
}

function getQuestionScore(attempt: Math3SelfTestAttempt, question: Math3SelfTestQuestion): number {
  return attempt.questionScores[question.id] ?? 0;
}

function getStepGrades(attempt: Math3SelfTestAttempt, questionId: string): Math3SelfTestStepGrade[] {
  return attempt.stepGrades[questionId] ?? [];
}

function getSolutionScore(attempt: Math3SelfTestAttempt, question: Math3SelfTestQuestion): number {
  return getStepGrades(attempt, question.id).reduce((sum, grade) => sum + grade.awardedPoints, 0);
}

function isQuestionFullyGraded(attempt: Math3SelfTestAttempt, question: Math3SelfTestQuestion): boolean {
  if (question.type !== "solution") return true;
  const gradedStepIds = new Set(getStepGrades(attempt, question.id).map((grade) => grade.stepId));
  return question.rubricSteps.length > 0 && question.rubricSteps.every((step) => gradedStepIds.has(step.id));
}

function getNextUngradedStep(attempt: Math3SelfTestAttempt, question: Math3SelfTestQuestion) {
  const gradedStepIds = new Set(getStepGrades(attempt, question.id).map((grade) => grade.stepId));
  return question.rubricSteps.find((step) => !gradedStepIds.has(step.id));
}

function hasAllSolutionStepsGraded(test: Math3SelfTestRecord, attempt: Math3SelfTestAttempt): boolean {
  return test.paper.questions
    .filter((question) => question.type === "solution")
    .every((question) => isQuestionFullyGraded(attempt, question));
}

function findNextUngradedSolutionIndex(test: Math3SelfTestRecord, startIndex = 0): number {
  const questions = test.paper.questions;
  if (questions.length === 0) return -1;

  for (let offset = 0; offset < questions.length; offset += 1) {
    const index = (startIndex + offset) % questions.length;
    const question = questions[index];
    if (question.type === "solution" && getNextUngradedStep(test.attempt, question)) {
      return index;
    }
  }

  return -1;
}

function getPendingSolutionStepCount(test: Math3SelfTestRecord): number {
  return test.paper.questions.reduce((count, question) => {
    if (question.type !== "solution") return count;
    const gradedStepIds = new Set(getStepGrades(test.attempt, question.id).map((grade) => grade.stepId));
    return count + question.rubricSteps.filter((step) => !gradedStepIds.has(step.id)).length;
  }, 0);
}

function getPreferredActiveTest(tests: Math3SelfTestRecord[]): Math3SelfTestRecord | null {
  return (
    tests.find((test) => test.status === "in_progress") ??
    tests.find((test) => test.status === "submitted") ??
    tests.find((test) => test.status === "draft") ??
    tests[0] ??
    null
  );
}

function computeSubmittedAttempt(test: Math3SelfTestRecord): Math3SelfTestAttempt {
  const nextAttempt: Math3SelfTestAttempt = {
    ...test.attempt,
    objectiveScores: { ...test.attempt.objectiveScores },
    stepGrades: { ...test.attempt.stepGrades },
    questionScores: { ...test.attempt.questionScores },
    submittedAt: new Date().toISOString(),
  };

  for (const question of test.paper.questions) {
    if (isObjectiveQuestion(question.type)) {
      const score = gradeObjectiveAnswer(question, nextAttempt.answers[question.id] ?? "");
      nextAttempt.objectiveScores[question.id] = score;
      nextAttempt.questionScores[question.id] = score;
      continue;
    }

    nextAttempt.questionScores[question.id] = getSolutionScore(nextAttempt, question);
  }

  nextAttempt.totalScore = sumMath3SelfTestScore(nextAttempt);
  return nextAttempt;
}

function updateAttemptAnswer(
  attempt: Math3SelfTestAttempt,
  questionId: string,
  answer: string,
): Math3SelfTestAttempt {
  return {
    ...attempt,
    answers: {
      ...attempt.answers,
      [questionId]: answer,
    },
  };
}

function toggleMarkedQuestion(attempt: Math3SelfTestAttempt, questionId: string): Math3SelfTestAttempt {
  const marked = new Set(attempt.markedQuestionIds);
  if (marked.has(questionId)) {
    marked.delete(questionId);
  } else {
    marked.add(questionId);
  }
  return {
    ...attempt,
    markedQuestionIds: Array.from(marked),
  };
}

export function Math3SelfTest() {
  const toast = useToast();
  const { loading: authLoading, isAdmin } = useAdminAuth();
  const [mode, setMode] = useState<Math3SelfTestMode>("quick");
  const [difficulty, setDifficulty] = useState<Math3SelfTestDifficulty>("simulation");
  const [tests, setTests] = useState<Math3SelfTestRecord[]>([]);
  const [activeTest, setActiveTest] = useState<Math3SelfTestRecord | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scoringStepId, setScoringStepId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const activeQuestion = activeTest?.paper.questions[activeIndex] ?? null;
  const isExamRunning = activeTest?.status === "in_progress";

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    let cancelled = false;

    async function loadTests() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await math3SelfTestsApi.getAll();
        if (cancelled) return;
        setTests(data);
        setActiveTest((current) => current ?? getPreferredActiveTest(data));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTests();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAdmin]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeTest?.id]);

  useEffect(() => {
    if (!isExamRunning) {
      setRemainingSeconds(getRemainingSeconds(activeTest));
      return;
    }

    const tick = () => setRemainingSeconds(getRemainingSeconds(activeTest));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeTest, isExamRunning]);

  const replaceTest = (test: Math3SelfTestRecord) => {
    setTests((current) => {
      const without = current.filter((item) => item.id !== test.id);
      return [test, ...without].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });
    setActiveTest(test);
  };

  const patchActiveAttempt = (updater: (attempt: Math3SelfTestAttempt) => Math3SelfTestAttempt) => {
    setActiveTest((current) => current ? { ...current, attempt: updater(current.attempt) } : current);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/math3-self-test/generate", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ mode, difficulty }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.paper) {
        throw new Error(typeof payload.error === "string" ? payload.error : "试卷生成失败");
      }

      if (typeof payload.tokensUsed === "number") recordDeepSeekUsage(payload.tokensUsed);

      const paper = payload.paper;
      const saved = await math3SelfTestsApi.create({
        title: paper.title,
        mode,
        difficulty,
        status: "draft",
        paper,
        attempt: createEmptyMath3SelfTestAttempt(),
        score: 0,
        maxScore: paper.totalScore,
      });

      replaceTest(saved);
      toast.success("试卷已生成并保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStart = async () => {
    if (!activeTest || isSaving) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const attempt = {
        ...activeTest.attempt,
        startedAt: activeTest.attempt.startedAt ?? now.toISOString(),
      };
      const saved = await math3SelfTestsApi.update(activeTest.id, {
        status: "in_progress",
        attempt,
        startedAt: activeTest.startedAt ?? now,
      });
      replaceTest(saved);
      toast.success("考试已开始");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`开始失败：${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!activeTest || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await math3SelfTestsApi.update(activeTest.id, {
        attempt: activeTest.attempt,
        score: activeTest.attempt.totalScore,
      });
      replaceTest(saved);
      toast.success("进度已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存失败：${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTest || isSaving) return;
    setIsSaving(true);
    try {
      const attempt = computeSubmittedAttempt(activeTest);
      const submittedAt = new Date(attempt.submittedAt ?? Date.now());
      const saved = await math3SelfTestsApi.update(activeTest.id, {
        status: "submitted",
        attempt,
        score: attempt.totalScore,
        submittedAt,
      });
      replaceTest(saved);
      const firstPendingStepIndex = findNextUngradedSolutionIndex(saved);
      if (firstPendingStepIndex >= 0) setActiveIndex(firstPendingStepIndex);
      toast.success("已交卷，解答题可以开始分步评分");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`交卷失败：${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGradeNextStep = async (question: Math3SelfTestQuestion) => {
    if (!activeTest || scoringStepId) return;
    const step = getNextUngradedStep(activeTest.attempt, question);
    if (!step) return;

    setScoringStepId(step.id);
    try {
      const response = await fetch("/api/ai/math3-self-test/grade-step", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          question,
          step,
          studentAnswer: activeTest.attempt.answers[question.id] ?? "",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.grade) {
        throw new Error(typeof payload.error === "string" ? payload.error : "分步评分失败");
      }

      if (typeof payload.tokensUsed === "number") recordDeepSeekUsage(payload.tokensUsed);

      const previousGrades = getStepGrades(activeTest.attempt, question.id)
        .filter((grade) => grade.stepId !== payload.grade.stepId);
      const nextAttempt: Math3SelfTestAttempt = {
        ...activeTest.attempt,
        stepGrades: {
          ...activeTest.attempt.stepGrades,
          [question.id]: [...previousGrades, payload.grade],
        },
        questionScores: {
          ...activeTest.attempt.questionScores,
          [question.id]: 0,
        },
      };
      nextAttempt.questionScores[question.id] = getSolutionScore(nextAttempt, question);
      nextAttempt.totalScore = sumMath3SelfTestScore(nextAttempt);

      const nextStatus: Math3SelfTestStatus = hasAllSolutionStepsGraded(activeTest, nextAttempt)
        ? "reviewed"
        : "submitted";

      const saved = await math3SelfTestsApi.update(activeTest.id, {
        status: nextStatus,
        attempt: nextAttempt,
        score: nextAttempt.totalScore,
      });
      replaceTest(saved);
      const nextPendingStepIndex = findNextUngradedSolutionIndex(saved, activeIndex);
      if (nextPendingStepIndex >= 0) setActiveIndex(nextPendingStepIndex);
      toast.success(nextPendingStepIndex >= 0 ? "已完成一个步骤评分，已定位到下一步" : "分步评分已完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(message);
    } finally {
      setScoringStepId(null);
    }
  };

  const answeredCount = useMemo(() => {
    if (!activeTest) return 0;
    return activeTest.paper.questions.filter((question) => Boolean(activeTest.attempt.answers[question.id]?.trim())).length;
  }, [activeTest]);
  const pendingStepLabel = activeTest && (activeTest.status === "submitted" || activeTest.status === "reviewed")
    ? `${getPendingSolutionStepCount(activeTest)} 步`
    : "-";

  if (authLoading) {
    return <ShellMessage icon={<Loader2 className="h-5 w-5 animate-spin" />} title="正在读取登录状态" />;
  }

  if (!isAdmin) {
    return (
      <ShellMessage
        icon={<BookOpenCheck className="h-5 w-5" />}
        title="需要管理员登录"
        description="自测卷会写入 Supabase，并调用服务端 AI key，所以暂时只开放给管理员使用。"
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <BookOpenCheck className="h-4 w-4" />
                数学三
              </div>
              <h1 className="font-headline text-3xl font-bold text-on-surface">自测</h1>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HeaderStat label="已保存" value={tests.length.toString()} />
              <HeaderStat label="当前得分" value={activeTest ? `${activeTest.score}/${activeTest.maxScore}` : "-"} />
              <HeaderStat label="剩余时间" value={activeTest ? formatDuration(remainingSeconds) : "-"} />
              <HeaderStat label="待评分" value={pendingStepLabel} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-ambient">
            <h2 className="mb-3 text-sm font-semibold text-on-surface">生成新卷</h2>
            <OptionGroup label="模式">
              {MODE_OPTIONS.map((option) => (
                <OptionButton key={option} active={mode === option} onClick={() => setMode(option)}>
                  <span className="font-medium">{math3SelfTestModeMeta[option].label}</span>
                  <span className="text-xs opacity-75">{math3SelfTestModeMeta[option].totalScore} 分</span>
                </OptionButton>
              ))}
            </OptionGroup>

            <OptionGroup label="难度">
              {DIFFICULTY_OPTIONS.map((option) => (
                <OptionButton key={option} active={difficulty === option} onClick={() => setDifficulty(option)}>
                  <span className="font-medium">{math3SelfTestDifficultyMeta[option].label}</span>
                </OptionButton>
              ))}
            </OptionGroup>

            <div className="rounded-lg bg-surface-container-low px-3 py-3 text-xs leading-5 text-on-surface-variant">
              <div>{math3SelfTestModeMeta[mode].description}</div>
              <div className="mt-1">{math3SelfTestDifficultyMeta[difficulty].prompt}</div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "生成中" : "生成试卷"}
            </button>
          </section>

          <section className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-on-surface">试卷记录</h2>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>

            {loadError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                {loadError.includes("math3_self_tests")
                  ? "需要先执行 supabase/math3_self_tests_schema.sql。"
                  : loadError}
              </div>
            ) : tests.length === 0 ? (
              <p className="text-sm leading-6 text-on-surface-variant">还没有保存的自测试卷。</p>
            ) : (
              <div className="space-y-2">
                {tests.map((test) => (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => setActiveTest(test)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      activeTest?.id === test.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"
                    }`}
                  >
                    <div className="line-clamp-2 text-sm font-medium text-on-surface">{test.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                      <span>{math3SelfTestModeMeta[test.mode].label}</span>
                      <span>{math3SelfTestDifficultyMeta[test.difficulty].label}</span>
                      <span>{math3SelfTestStatusMeta[test.status]}</span>
                    </div>
                    <div className="mt-1 text-xs text-on-surface-variant/70">{formatDate(test.updatedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="min-h-[680px] rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-ambient">
          {!activeTest ? (
            <ShellMessage icon={<FileText className="h-5 w-5" />} title="选择或生成一份试卷" />
          ) : activeTest.status === "draft" ? (
            <PaperPreview test={activeTest} isSaving={isSaving} onStart={handleStart} />
          ) : activeTest.status === "in_progress" ? (
            <ExamView
              test={activeTest}
              activeIndex={activeIndex}
              activeQuestion={activeQuestion}
              answeredCount={answeredCount}
              remainingSeconds={remainingSeconds}
              isSaving={isSaving}
              onMove={setActiveIndex}
              onAnswerChange={(questionId, answer) => patchActiveAttempt((attempt) => updateAttemptAnswer(attempt, questionId, answer))}
              onToggleMark={(questionId) => patchActiveAttempt((attempt) => toggleMarkedQuestion(attempt, questionId))}
              onSave={handleSaveProgress}
              onSubmit={handleSubmit}
            />
          ) : (
            <ReviewView
              test={activeTest}
              activeIndex={activeIndex}
              activeQuestion={activeQuestion}
              scoringStepId={scoringStepId}
              onMove={setActiveIndex}
              onGradeNextStep={handleGradeNextStep}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function ShellMessage({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high text-primary">
        {icon}
      </div>
      <div className="text-sm font-semibold text-on-surface">{title}</div>
      {description && <p className="max-w-md text-sm leading-6">{description}</p>}
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest px-4 py-3 text-center shadow-ambient">
      <div className="text-lg font-bold text-primary">{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-medium text-on-surface-variant">{label}</div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition-colors ${
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-outline-variant/25 bg-surface-container-low text-on-surface-variant hover:border-primary/25"
      }`}
    >
      {children}
    </button>
  );
}

function PaperPreview({ test, isSaving, onStart }: {
  test: Math3SelfTestRecord;
  isSaving: boolean;
  onStart: () => void;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-col gap-4 border-b border-outline-variant/15 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <Badge>{math3SelfTestModeMeta[test.mode].label}</Badge>
            <Badge className={math3SelfTestDifficultyMeta[test.difficulty].tone}>
              {math3SelfTestDifficultyMeta[test.difficulty].label}
            </Badge>
            <Badge>{test.paper.durationMinutes} 分钟</Badge>
          </div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">{test.title}</h2>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          开始考试
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <PreviewStat label="题量" value={`${test.paper.questions.length} 题`} />
        <PreviewStat label="总分" value={`${test.paper.totalScore} 分`} />
        <PreviewStat label="选择/填空" value={`${test.paper.questions.filter((q) => q.type !== "solution").length} 题`} />
        <PreviewStat label="解答题" value={`${test.paper.questions.filter((q) => q.type === "solution").length} 题`} />
      </div>

      <div className="mt-6 grid gap-3">
        {test.paper.questions.map((question) => (
          <div key={question.id} className="rounded-lg border border-outline-variant/15 bg-surface-container-low px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge>第 {question.index} 题</Badge>
              <Badge>{math3SelfTestTypeLabels[question.type]}</Badge>
              <Badge>{question.score} 分</Badge>
            </div>
            <MarkdownContent content={question.question} compact className="line-clamp-3 text-sm text-on-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamView({
  test,
  activeIndex,
  activeQuestion,
  answeredCount,
  remainingSeconds,
  isSaving,
  onMove,
  onAnswerChange,
  onToggleMark,
  onSave,
  onSubmit,
}: {
  test: Math3SelfTestRecord;
  activeIndex: number;
  activeQuestion: Math3SelfTestQuestion | null;
  answeredCount: number;
  remainingSeconds: number;
  isSaving: boolean;
  onMove: (index: number) => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onToggleMark: (questionId: string) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  if (!activeQuestion) return <ShellMessage icon={<FileText className="h-5 w-5" />} title="试卷为空" />;

  const markedSet = new Set(test.attempt.markedQuestionIds);
  const currentAnswer = test.attempt.answers[activeQuestion.id] ?? "";

  return (
    <div className="grid min-h-[680px] lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-outline-variant/15 bg-surface-container-low p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4 rounded-lg bg-surface-container-lowest p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Clock3 className="h-4 w-4 text-primary" />
            {formatDuration(remainingSeconds)}
          </div>
          <div className="mt-1 text-xs text-on-surface-variant">
            已答 {answeredCount} / {test.paper.questions.length}
          </div>
        </div>

        <QuestionGrid test={test} activeIndex={activeIndex} onMove={onMove} />

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存进度
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            交卷
          </button>
        </div>
      </aside>

      <article className="flex min-h-[680px] flex-col p-5">
        <QuestionHeader
          question={activeQuestion}
          activeIndex={activeIndex}
          total={test.paper.questions.length}
          marked={markedSet.has(activeQuestion.id)}
          onToggleMark={() => onToggleMark(activeQuestion.id)}
          onPrev={() => onMove(Math.max(0, activeIndex - 1))}
          onNext={() => onMove(Math.min(test.paper.questions.length - 1, activeIndex + 1))}
        />

        <div className="flex-1 space-y-5">
          <div className="rounded-xl bg-surface-container-low p-5">
            <MarkdownContent content={activeQuestion.question} className="text-on-surface" />
          </div>

          {activeQuestion.type === "choice" && activeQuestion.options && (
            <div className="grid gap-2">
              {activeQuestion.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onAnswerChange(activeQuestion.id, option.label)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    currentAnswer === option.label
                      ? "border-primary/40 bg-primary/10"
                      : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"
                  }`}
                >
                  <span className="mr-2 font-semibold text-primary">{option.label}.</span>
                  <MarkdownContent content={option.content} compact className="inline text-sm text-on-surface" />
                </button>
              ))}
            </div>
          )}

          {activeQuestion.type !== "choice" && (
            <textarea
              value={currentAnswer}
              onChange={(event) => onAnswerChange(activeQuestion.id, event.target.value)}
              rows={activeQuestion.type === "solution" ? 12 : 3}
              className="w-full resize-y rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/45 focus:border-primary/40"
              placeholder={activeQuestion.type === "solution" ? "写出完整解题过程" : "填写答案"}
            />
          )}
        </div>
      </article>
    </div>
  );
}

function ReviewView({
  test,
  activeIndex,
  activeQuestion,
  scoringStepId,
  onMove,
  onGradeNextStep,
}: {
  test: Math3SelfTestRecord;
  activeIndex: number;
  activeQuestion: Math3SelfTestQuestion | null;
  scoringStepId: string | null;
  onMove: (index: number) => void;
  onGradeNextStep: (question: Math3SelfTestQuestion) => void;
}) {
  if (!activeQuestion) return <ShellMessage icon={<FileText className="h-5 w-5" />} title="试卷为空" />;

  const answer = test.attempt.answers[activeQuestion.id] ?? "未作答";
  const nextStep = getNextUngradedStep(test.attempt, activeQuestion);
  const nextPendingIndex = findNextUngradedSolutionIndex(test, activeIndex);
  const pendingStepCount = getPendingSolutionStepCount(test);
  const stepGrades = getStepGrades(test.attempt, activeQuestion.id);
  const fullyGraded = isQuestionFullyGraded(test.attempt, activeQuestion);
  const canGradeActiveQuestion = activeQuestion.type === "solution" && Boolean(nextStep);

  return (
    <div className="grid min-h-[680px] lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-outline-variant/15 bg-surface-container-low p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4 rounded-lg bg-surface-container-lowest p-3">
          <div className="text-sm font-semibold text-on-surface">{test.score} / {test.maxScore} 分</div>
          <div className="mt-1 text-xs text-on-surface-variant">{math3SelfTestStatusMeta[test.status]}</div>
          <div className="mt-2 text-xs text-on-surface-variant">待评分 {pendingStepCount} 步</div>
        </div>
        <QuestionGrid test={test} activeIndex={activeIndex} onMove={onMove} showScore />

        <button
          type="button"
          onClick={() => {
            if (canGradeActiveQuestion) {
              onGradeNextStep(activeQuestion);
              return;
            }
            if (nextPendingIndex >= 0) onMove(nextPendingIndex);
          }}
          disabled={Boolean(scoringStepId) || pendingStepCount === 0}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {scoringStepId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          {canGradeActiveQuestion
            ? `评分：${nextStep?.label}`
            : pendingStepCount > 0
              ? "定位下一步评分"
              : "复盘完成"}
        </button>
      </aside>

      <article className="space-y-5 p-5">
        <QuestionHeader
          question={activeQuestion}
          activeIndex={activeIndex}
          total={test.paper.questions.length}
          marked={test.attempt.markedQuestionIds.includes(activeQuestion.id)}
          onToggleMark={() => undefined}
          onPrev={() => onMove(Math.max(0, activeIndex - 1))}
          onNext={() => onMove(Math.min(test.paper.questions.length - 1, activeIndex + 1))}
          readonly
        />

        <ReviewBlock title="题目">
          <MarkdownContent content={activeQuestion.question} className="text-on-surface" />
          {activeQuestion.options && activeQuestion.options.length > 0 && (
            <div className="mt-4 grid gap-2">
              {activeQuestion.options.map((option) => (
                <div key={option.label} className="rounded-lg bg-surface-container-low px-3 py-2">
                  <span className="mr-2 font-semibold text-primary">{option.label}.</span>
                  <MarkdownContent content={option.content} compact className="inline text-sm text-on-surface" />
                </div>
              ))}
            </div>
          )}
        </ReviewBlock>

        <div className="grid gap-4 xl:grid-cols-2">
          <ReviewBlock title="我的作答">
            <MarkdownContent content={answer} className="text-on-surface" />
          </ReviewBlock>
          <ReviewBlock title="参考答案">
            <MarkdownContent content={activeQuestion.answer || "暂无答案"} className="text-on-surface" />
          </ReviewBlock>
        </div>

        <ReviewBlock title="解析">
          <MarkdownContent content={activeQuestion.explanation || "暂无解析"} className="text-on-surface" />
        </ReviewBlock>

        {activeQuestion.type === "solution" ? (
          <ReviewBlock title={`分步评分 · ${getQuestionScore(test.attempt, activeQuestion)} / ${activeQuestion.score} 分`}>
            <div className="space-y-3">
              {activeQuestion.rubricSteps.map((step) => {
                const grade = stepGrades.find((item) => item.stepId === step.id);
                return (
                  <div key={step.id} className="rounded-lg border border-outline-variant/15 bg-surface-container-low px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-on-surface">{step.label}</div>
                      <Badge>{grade ? `${grade.awardedPoints}/${step.points} 分` : `${step.points} 分`}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-on-surface-variant">{step.expected}</p>
                    {grade && (
                      <p className="mt-2 rounded-md bg-surface-container-lowest px-3 py-2 text-sm leading-6 text-on-surface">
                        {grade.feedback}
                      </p>
                    )}
                  </div>
                );
              })}

              <p className="text-sm text-on-surface-variant">
                {fullyGraded ? "本题分步评分已完成。" : "使用左侧“评分”按钮，每次只评一个步骤。"}
              </p>
            </div>
          </ReviewBlock>
        ) : (
          <ReviewBlock title={`自动判分 · ${getQuestionScore(test.attempt, activeQuestion)} / ${activeQuestion.score} 分`}>
            <p className="text-sm text-on-surface-variant">
              客观题按参考答案直接判分，填空题暂时使用严格文本匹配。
            </p>
          </ReviewBlock>
        )}
      </article>
    </div>
  );
}

function QuestionHeader({
  question,
  activeIndex,
  total,
  marked,
  readonly,
  onToggleMark,
  onPrev,
  onNext,
}: {
  question: Math3SelfTestQuestion;
  activeIndex: number;
  total: number;
  marked: boolean;
  readonly?: boolean;
  onToggleMark: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-outline-variant/10 pb-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <Badge>第 {question.index} / {total} 题</Badge>
          <Badge>{math3SelfTestTypeLabels[question.type]}</Badge>
          <Badge>{question.score} 分</Badge>
          {marked && <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700">已标记</Badge>}
        </div>
        <div className="text-sm text-on-surface-variant">当前题号：{activeIndex + 1}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!readonly && (
          <button
            type="button"
            onClick={onToggleMark}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
              marked
                ? "bg-amber-500/10 text-amber-700"
                : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            <Flag className="h-4 w-4" />
            标记
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          disabled={activeIndex === 0}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-container-high px-3 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          上一题
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={activeIndex >= total - 1}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-container-high px-3 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
        >
          下一题
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function QuestionGrid({ test, activeIndex, onMove, showScore = false }: {
  test: Math3SelfTestRecord;
  activeIndex: number;
  onMove: (index: number) => void;
  showScore?: boolean;
}) {
  const markedSet = new Set(test.attempt.markedQuestionIds);
  return (
    <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
      {test.paper.questions.map((question, index) => {
        const answered = Boolean(test.attempt.answers[question.id]?.trim());
        const score = getQuestionScore(test.attempt, question);
        return (
          <button
            key={question.id}
            type="button"
            onClick={() => onMove(index)}
            className={`h-10 rounded-lg text-xs font-semibold transition-colors ${
              activeIndex === index
                ? "bg-primary text-on-primary"
                : answered
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
            } ${markedSet.has(question.id) ? "ring-2 ring-amber-400/50" : ""}`}
            title={showScore ? `${score}/${question.score} 分` : undefined}
          >
            {showScore ? `${score}/${question.score}` : question.index}
          </button>
        );
      })}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-4 py-3">
      <div className="text-lg font-bold text-primary">{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-5">
      <h3 className="mb-3 text-sm font-semibold text-on-surface-variant">{title}</h3>
      {children}
    </section>
  );
}

function Badge({ children, className = "border-outline-variant/15 bg-surface-container-high text-on-surface-variant" }: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
