import { isEnglishObjectiveSection, type EnglishSection } from "./english-training.ts";
import { scoreEnglishObjectiveAnswers } from "./english-scoring.ts";

export type LegacyEnglishAttemptRecord = {
  id: string;
  userId: string;
  passageId: string;
  status: string;
  score: number;
  maxScore: number;
  startedAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LegacyEnglishAnswerRecord = {
  id: string;
  attemptId: string;
  questionId: string;
  answer: string;
  isCorrect?: boolean;
  score: number;
  createdAt: string;
  updatedAt: string;
};

export type LegacyEnglishPassageRecord = {
  id: string;
  section: EnglishSection;
};

export type LegacyEnglishQuestionRecord = {
  id: string;
  passageId: string;
  standardAnswer: string;
  score: number;
};

export type EnglishBackfillConflictKind =
  | "duplicate_attempt_id"
  | "duplicate_user_passage"
  | "orphan_attempt_passage"
  | "invalid_attempt_status"
  | "invalid_legacy_score"
  | "orphan_answer_attempt"
  | "orphan_answer_question"
  | "answer_passage_mismatch"
  | "duplicate_attempt_question"
  | "submitted_without_answers"
  | "objective_source_incomplete";

export type EnglishBackfillConflict = {
  kind: EnglishBackfillConflictKind;
  sourceIds: string[];
};

export type EnglishBackfillGradePlan = {
  origin: "legacy_imported" | "system_scored";
  scoringMode: "objective" | "subjective";
  score: number;
  maxScore: number;
  breakdown: Record<string, unknown>;
};

export type EnglishBackfillAttemptPlan = {
  sourceAttemptId: string;
  userId: string;
  passageId: string;
  round: 1;
  status: "in_progress" | "submitted";
  draftPayload: { answers: Record<string, string> };
  responsePayload?: { answers: Record<string, string> };
  sourceSnapshot?: {
    legacyEnglishAttemptId: string;
    passageId: string;
    questionIds: string[];
  };
  grades: EnglishBackfillGradePlan[];
  startedAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnglishBackfillPlan = {
  attempts: EnglishBackfillAttemptPlan[];
  conflicts: EnglishBackfillConflict[];
  sourceCounts: {
    attempts: number;
    answers: number;
    passages: number;
    questions: number;
  };
  insertCounts: {
    attempts: number;
    revisions: number;
    legacyGrades: number;
    systemGrades: number;
  };
  recomputedScoreDifferences: Array<{
    sourceAttemptId: string;
    passageId: string;
    section: EnglishSection;
    legacyScore: number;
    legacyMaxScore: number;
    systemScore: number;
    systemMaxScore: number;
    storedAnswerScore: number;
    storedCorrectCount: number;
    systemCorrectCount: number;
    answerVerdictDifferenceCount: number;
  }>;
};

type EnglishBackfillInput = {
  attempts: LegacyEnglishAttemptRecord[];
  answers: LegacyEnglishAnswerRecord[];
  passages: LegacyEnglishPassageRecord[];
  questions: LegacyEnglishQuestionRecord[];
};

function pushConflict(
  conflicts: EnglishBackfillConflict[],
  kind: EnglishBackfillConflictKind,
  ...sourceIds: Array<string | undefined>
): void {
  conflicts.push({ kind, sourceIds: sourceIds.filter((value): value is string => Boolean(value)) });
}

function isValidScore(score: number, maxScore: number): boolean {
  return Number.isFinite(score)
    && Number.isFinite(maxScore)
    && maxScore >= 0
    && score >= 0
    && score <= maxScore;
}

export function planEnglishTrainingBackfill(input: EnglishBackfillInput): EnglishBackfillPlan {
  const conflicts: EnglishBackfillConflict[] = [];
  const passageById = new Map(input.passages.map((passage) => [passage.id, passage]));
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const questionsByPassage = new Map<string, LegacyEnglishQuestionRecord[]>();
  for (const question of input.questions) {
    const current = questionsByPassage.get(question.passageId) ?? [];
    current.push(question);
    questionsByPassage.set(question.passageId, current);
  }

  const attemptById = new Map<string, LegacyEnglishAttemptRecord>();
  const userPassageKeys = new Map<string, string>();
  for (const attempt of input.attempts) {
    if (attemptById.has(attempt.id)) {
      pushConflict(conflicts, "duplicate_attempt_id", attempt.id);
      continue;
    }
    attemptById.set(attempt.id, attempt);
    const key = `${attempt.userId}\u0000${attempt.passageId}`;
    const existingId = userPassageKeys.get(key);
    if (existingId) pushConflict(conflicts, "duplicate_user_passage", existingId, attempt.id);
    else userPassageKeys.set(key, attempt.id);
  }

  const answersByAttempt = new Map<string, LegacyEnglishAnswerRecord[]>();
  const answerKeys = new Set<string>();
  for (const answer of input.answers) {
    const attempt = attemptById.get(answer.attemptId);
    if (!attempt) {
      pushConflict(conflicts, "orphan_answer_attempt", answer.id, answer.attemptId);
      continue;
    }
    const question = questionById.get(answer.questionId);
    if (!question) {
      pushConflict(conflicts, "orphan_answer_question", answer.id, answer.questionId);
      continue;
    }
    if (question.passageId !== attempt.passageId) {
      pushConflict(conflicts, "answer_passage_mismatch", answer.id, answer.attemptId, answer.questionId);
      continue;
    }
    const key = `${answer.attemptId}\u0000${answer.questionId}`;
    if (answerKeys.has(key)) {
      pushConflict(conflicts, "duplicate_attempt_question", answer.id, answer.attemptId, answer.questionId);
      continue;
    }
    answerKeys.add(key);
    const current = answersByAttempt.get(answer.attemptId) ?? [];
    current.push(answer);
    answersByAttempt.set(answer.attemptId, current);
  }

  const attempts: EnglishBackfillAttemptPlan[] = [];
  const recomputedScoreDifferences: EnglishBackfillPlan["recomputedScoreDifferences"] = [];
  for (const attempt of attemptById.values()) {
    const passage = passageById.get(attempt.passageId);
    if (!passage) {
      pushConflict(conflicts, "orphan_attempt_passage", attempt.id, attempt.passageId);
      continue;
    }
    if (attempt.status !== "in_progress" && attempt.status !== "submitted") {
      pushConflict(conflicts, "invalid_attempt_status", attempt.id);
      continue;
    }

    const answerRows = answersByAttempt.get(attempt.id) ?? [];
    const answerSnapshot = Object.fromEntries(answerRows.map((answer) => [answer.questionId, answer.answer]));
    const plan: EnglishBackfillAttemptPlan = {
      sourceAttemptId: attempt.id,
      userId: attempt.userId,
      passageId: attempt.passageId,
      round: 1,
      status: attempt.status,
      draftPayload: attempt.status === "in_progress" ? { answers: answerSnapshot } : { answers: {} },
      grades: [],
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };

    if (attempt.status === "submitted") {
      if (answerRows.length === 0) {
        pushConflict(conflicts, "submitted_without_answers", attempt.id);
      } else {
        plan.responsePayload = { answers: answerSnapshot };
        plan.sourceSnapshot = {
          legacyEnglishAttemptId: attempt.id,
          passageId: attempt.passageId,
          questionIds: answerRows.map((answer) => answer.questionId).sort(),
        };

        if (isValidScore(attempt.score, attempt.maxScore)) {
          plan.grades.push({
            origin: "legacy_imported",
            scoringMode: isEnglishObjectiveSection(passage.section) ? "objective" : "subjective",
            score: attempt.score,
            maxScore: attempt.maxScore,
            breakdown: { source: "english_attempts", historicalContinuity: true },
          });
        } else {
          pushConflict(conflicts, "invalid_legacy_score", attempt.id);
        }

        if (isEnglishObjectiveSection(passage.section)) {
          const officialQuestions = questionsByPassage.get(passage.id) ?? [];
          const completeOfficialSource = officialQuestions.length > 0
            && officialQuestions.every((question) => question.standardAnswer.trim() && isValidScore(question.score, question.score));
          if (!completeOfficialSource) {
            pushConflict(conflicts, "objective_source_incomplete", attempt.id, passage.id);
          } else {
            const system = scoreEnglishObjectiveAnswers(
              passage.section,
              officialQuestions.map((question) => ({
                id: question.id,
                standardAnswer: question.standardAnswer,
                score: question.score,
              })),
              answerSnapshot,
            );
            plan.grades.push({
              origin: "system_scored",
              scoringMode: "objective",
              score: system.score,
              maxScore: system.maxScore,
              breakdown: {
                source: "current_official_answers",
                questionCount: system.grades.length,
                correctCount: system.grades.filter((grade) => grade.isCorrect).length,
              },
            });
            if (system.score !== attempt.score || system.maxScore !== attempt.maxScore) {
              const systemGradeByQuestion = new Map(system.grades.map((grade) => [grade.questionId, grade]));
              recomputedScoreDifferences.push({
                sourceAttemptId: attempt.id,
                passageId: attempt.passageId,
                section: passage.section,
                legacyScore: attempt.score,
                legacyMaxScore: attempt.maxScore,
                systemScore: system.score,
                systemMaxScore: system.maxScore,
                storedAnswerScore: answerRows.reduce((sum, answer) => sum + answer.score, 0),
                storedCorrectCount: answerRows.filter((answer) => answer.isCorrect === true).length,
                systemCorrectCount: system.grades.filter((grade) => grade.isCorrect).length,
                answerVerdictDifferenceCount: answerRows.filter((answer) => {
                  const systemGrade = systemGradeByQuestion.get(answer.questionId);
                  return answer.isCorrect !== undefined && systemGrade && answer.isCorrect !== systemGrade.isCorrect;
                }).length,
              });
            }
          }
        }
      }
    }

    attempts.push(plan);
  }

  return {
    attempts,
    conflicts,
    sourceCounts: {
      attempts: input.attempts.length,
      answers: input.answers.length,
      passages: input.passages.length,
      questions: input.questions.length,
    },
    insertCounts: {
      attempts: attempts.length,
      revisions: attempts.filter((attempt) => Boolean(attempt.responsePayload)).length,
      legacyGrades: attempts.reduce((count, attempt) => count + attempt.grades.filter((grade) => grade.origin === "legacy_imported").length, 0),
      systemGrades: attempts.reduce((count, attempt) => count + attempt.grades.filter((grade) => grade.origin === "system_scored").length, 0),
    },
    recomputedScoreDifferences,
  };
}
