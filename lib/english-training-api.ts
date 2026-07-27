import { getSupabase } from "./supabase";
import { buildAuthHeaders } from "./fetch-with-auth";
import { normalizeEnglishQuestionOptions } from "./english-training";
import type { EnglishPassageRoundLedger } from "./english-round-history";
import type { EnglishTrainingCommandAction, EnglishTrainingPersistenceMode } from "./english-training-core";
import {
  buildEnglishSubjectiveGradeBreakdown,
  type EnglishSubjectiveGradeSuggestion,
} from "./english-subjective-grade";
import { AI_CONFIG_STORAGE_KEY, ALLOW_CLIENT_AI_KEYS, DEFAULT_AI_CONFIG, normalizeAIConfig } from "./ai-config";
import { readJsonStorage } from "./browser-storage";
import type {
  EnglishAttempt,
  EnglishAttemptAnswer,
  EnglishPaper,
  EnglishPassage,
  EnglishQuestion,
  EnglishTrainingData,
} from "./english-training";
import type {
  EnglishAttemptAnswerInsert,
  EnglishAttemptAnswerRow,
  EnglishAttemptInsert,
  EnglishAttemptRow,
  EnglishPaperRow,
  EnglishPassageRow,
  EnglishQuestionRow,
} from "./supabase-schema";

const ENGLISH_PAPER_FIELDS = "id,year,paper_type,title,total_score,created_at,updated_at";
const ENGLISH_PASSAGE_FIELDS = "id,paper_id,year,section,passage_no,title,content,total_score,sort_order,created_at,updated_at";
const ENGLISH_QUESTION_FIELDS = "id,passage_id,question_no,stem,options,standard_answer,score,sort_order,created_at,updated_at";
const ENGLISH_ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ENGLISH_ATTEMPT_ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";

export type EnglishAttemptAnswerInput = Record<string, string>;

export type EnglishTrainingRoundHistory = {
  mode: EnglishTrainingPersistenceMode;
  ledgers: EnglishPassageRoundLedger[];
};

export type EnglishTrainingCommandResult = EnglishTrainingRoundHistory & {
  attempt?: EnglishAttempt;
};

export type EnglishSubjectiveSuggestionResult = EnglishTrainingRoundHistory & {
  suggestion: EnglishSubjectiveGradeSuggestion;
};

async function readRoundHistoryResponse(response: Response, fallback: string): Promise<EnglishTrainingRoundHistory> {
  const payload = await response.json().catch(() => ({})) as {
    mode?: EnglishTrainingPersistenceMode;
    ledgers?: EnglishPassageRoundLedger[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || fallback);
  return {
    mode: payload.mode === "dual" || payload.mode === "shared" ? payload.mode : "legacy",
    ledgers: Array.isArray(payload.ledgers) ? payload.ledgers : [],
  };
}

function toDate(value: string | null | undefined, fallback = new Date()): Date {
  return value ? new Date(value) : fallback;
}

function mapPaper(row: EnglishPaperRow): EnglishPaper {
  const createdAt = toDate(row.created_at);
  return {
    id: row.id ?? "",
    year: row.year ?? 0,
    paperType: row.paper_type ?? "english1",
    title: row.title ?? "",
    totalScore: row.total_score ?? 0,
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
  };
}

function mapPassage(row: EnglishPassageRow): EnglishPassage {
  const createdAt = toDate(row.created_at);
  return {
    id: row.id ?? "",
    paperId: row.paper_id ?? "",
    year: row.year ?? 0,
    section: row.section ?? "reading",
    passageNo: row.passage_no ?? "text1",
    title: row.title ?? "",
    content: row.content ?? "",
    totalScore: row.total_score ?? 0,
    sortOrder: row.sort_order ?? 0,
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
  };
}

function mapQuestion(row: EnglishQuestionRow): EnglishQuestion {
  const createdAt = toDate(row.created_at);
  return {
    id: row.id ?? "",
    passageId: row.passage_id ?? "",
    questionNo: row.question_no ?? "",
    stem: row.stem ?? "",
    options: normalizeEnglishQuestionOptions(row.options),
    standardAnswer: row.standard_answer ?? "",
    score: row.score ?? 0,
    sortOrder: row.sort_order ?? 0,
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
  };
}

function mapAttemptAnswer(row: EnglishAttemptAnswerRow): EnglishAttemptAnswer {
  const createdAt = toDate(row.created_at);
  return {
    id: row.id ?? "",
    attemptId: row.attempt_id ?? "",
    questionId: row.question_id ?? "",
    answer: row.answer ?? "",
    isCorrect: row.is_correct ?? undefined,
    score: row.score ?? 0,
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
  };
}

function mapAttempt(row: EnglishAttemptRow, answers: EnglishAttemptAnswer[] = []): EnglishAttempt {
  const createdAt = toDate(row.created_at);
  const startedAt = toDate(row.started_at, createdAt);
  return {
    id: row.id ?? "",
    userId: row.user_id ?? undefined,
    passageId: row.passage_id ?? "",
    status: row.status ?? "in_progress",
    score: row.score ?? 0,
    maxScore: row.max_score ?? 0,
    startedAt,
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
    answers,
  };
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export const englishTrainingApi = {
  async getRoundHistory(): Promise<EnglishTrainingRoundHistory> {
    const response = await fetch("/api/english/attempt", {
      method: "GET",
      headers: await buildAuthHeaders(),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      mode?: EnglishTrainingPersistenceMode;
      ledgers?: EnglishPassageRoundLedger[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "英语训练历史加载失败");
    return {
      mode: payload.mode === "dual" || payload.mode === "shared" ? payload.mode : "legacy",
      ledgers: Array.isArray(payload.ledgers) ? payload.ledgers : [],
    };
  },

  async getTrainingData(): Promise<EnglishTrainingData> {
    const supabase = getSupabase();
    const userId = await getCurrentUserId();

    const { data: paperRows, error: paperError } = await supabase
      .from("english_papers")
      .select(ENGLISH_PAPER_FIELDS)
      .order("year", { ascending: false });
    if (paperError) throw paperError;

    const { data: passageRows, error: passageError } = await supabase
      .from("english_passages")
      .select(ENGLISH_PASSAGE_FIELDS)
      .order("year", { ascending: false })
      .order("sort_order", { ascending: true });
    if (passageError) throw passageError;

    const passages = ((passageRows || []) as EnglishPassageRow[]).map(mapPassage);
    const passageIds = passages.map((passage) => passage.id).filter(Boolean);

    const questions = passageIds.length === 0
      ? []
      : await supabase
          .from("english_questions")
          .select(ENGLISH_QUESTION_FIELDS)
          .in("passage_id", passageIds)
          .order("sort_order", { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data || []) as EnglishQuestionRow[]).map(mapQuestion);
          });

    if (!userId || passageIds.length === 0) {
      return {
        papers: ((paperRows || []) as EnglishPaperRow[]).map(mapPaper),
        passages,
        questions,
        attempts: [],
      };
    }

    const attemptRows = await supabase
      .from("english_attempts")
      .select(ENGLISH_ATTEMPT_FIELDS)
      .eq("user_id", userId)
      .in("passage_id", passageIds)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data || []) as EnglishAttemptRow[];
      });
    const attemptIds = attemptRows.map((attempt) => attempt.id).filter((id): id is string => Boolean(id));

    const answerRows = attemptIds.length === 0
      ? []
      : await supabase
          .from("english_attempt_answers")
          .select(ENGLISH_ATTEMPT_ANSWER_FIELDS)
          .in("attempt_id", attemptIds)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data || []) as EnglishAttemptAnswerRow[]).map(mapAttemptAnswer);
          });
    const answersByAttemptId = new Map<string, EnglishAttemptAnswer[]>();
    for (const answer of answerRows) {
      const current = answersByAttemptId.get(answer.attemptId) ?? [];
      current.push(answer);
      answersByAttemptId.set(answer.attemptId, current);
    }

    return {
      papers: ((paperRows || []) as EnglishPaperRow[]).map(mapPaper),
      passages,
      questions,
      attempts: attemptRows.map((attempt) => mapAttempt(attempt, answersByAttemptId.get(attempt.id ?? "") ?? [])),
    };
  },

  async saveAttempt({
    passage,
    answers,
    round,
    action,
  }: {
    passage: EnglishPassage;
    answers: EnglishAttemptAnswerInput;
    round: 1 | 2 | 3;
    action: Exclude<EnglishTrainingCommandAction, "start_next">;
  }): Promise<EnglishTrainingCommandResult> {
    const response = await fetch("/api/english/attempt", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        passageId: passage.id,
        answers,
        round,
        action,
        commandId: crypto.randomUUID(),
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      attempt?: EnglishAttemptRow | null;
      answers?: EnglishAttemptAnswerRow[];
      mode?: EnglishTrainingPersistenceMode;
      ledgers?: EnglishPassageRoundLedger[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "英语训练保存失败");
    return {
      mode: payload.mode === "dual" || payload.mode === "shared" ? payload.mode : "legacy",
      ledgers: Array.isArray(payload.ledgers) ? payload.ledgers : [],
      ...(payload.attempt ? { attempt: mapAttempt(payload.attempt, (payload.answers ?? []).map(mapAttemptAnswer)) } : {}),
    };
  },

  async startNextRound(
    passage: EnglishPassage,
    round: 1 | 2 | 3,
  ): Promise<EnglishTrainingCommandResult> {
    const response = await fetch("/api/english/attempt", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        passageId: passage.id,
        answers: {},
        round,
        action: "start_next",
        commandId: crypto.randomUUID(),
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      attempt?: EnglishAttemptRow | null;
      answers?: EnglishAttemptAnswerRow[];
      mode?: EnglishTrainingPersistenceMode;
      ledgers?: EnglishPassageRoundLedger[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "无法开始下一轮");
    return {
      mode: payload.mode === "dual" || payload.mode === "shared" ? payload.mode : "legacy",
      ledgers: Array.isArray(payload.ledgers) ? payload.ledgers : [],
      ...(payload.attempt ? { attempt: mapAttempt(payload.attempt, (payload.answers ?? []).map(mapAttemptAnswer)) } : {}),
    };
  },

  async requestSubjectiveSuggestion({
    passage,
    round,
    answers,
  }: {
    passage: EnglishPassage;
    round: 1 | 2 | 3;
    answers: EnglishAttemptAnswerInput;
  }): Promise<EnglishSubjectiveSuggestionResult> {
    const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
    const suggestionResponse = await fetch("/api/ai/english-subjective-grade", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        passageId: passage.id,
        answers,
        apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
      }),
    });
    const suggestionPayload = await suggestionResponse.json().catch(() => ({})) as {
      suggestion?: EnglishSubjectiveGradeSuggestion;
      error?: string;
    };
    if (!suggestionResponse.ok || !suggestionPayload.suggestion) {
      throw new Error(suggestionPayload.error || "英语主观题建议评分失败");
    }

    const suggestion = suggestionPayload.suggestion;
    const recordResponse = await fetch("/api/english/subjective", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: "record_suggestion",
        passageId: passage.id,
        round,
        answers,
        commandId: crypto.randomUUID(),
        suggestion: {
          score: suggestion.score,
          feedback: suggestion.feedback,
          breakdown: buildEnglishSubjectiveGradeBreakdown(suggestion),
        },
      }),
    });
    return { ...await readRoundHistoryResponse(recordResponse, "AI 建议保存失败"), suggestion };
  },

  async confirmSubjectiveGrade({
    passage,
    revisionId,
    score,
    feedback,
    suggestion,
  }: {
    passage: EnglishPassage;
    revisionId: string;
    score: number;
    feedback: string;
    suggestion: EnglishSubjectiveGradeSuggestion;
  }): Promise<EnglishTrainingRoundHistory> {
    const response = await fetch("/api/english/subjective", {
      method: "POST",
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: "confirm_final",
        passageId: passage.id,
        revisionId,
        commandId: crypto.randomUUID(),
        score,
        feedback,
        breakdown: {
          ...buildEnglishSubjectiveGradeBreakdown(suggestion),
          decision: "user_confirmed",
          suggestedScore: suggestion.score,
        },
      }),
    });
    return readRoundHistoryResponse(response, "英语主观题终分确认失败");
  },
};
