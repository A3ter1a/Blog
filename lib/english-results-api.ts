import { getSupabase } from "./supabase";
import {
  englishPassageLabels,
  englishSectionLabels,
  type EnglishAttempt,
  type EnglishAttemptAnswer,
  type EnglishPassage,
  type EnglishQuestion,
} from "./english-training";
import type {
  EnglishAttemptAnswerRow,
  EnglishAttemptRow,
  EnglishPassageRow,
  EnglishQuestionRow,
} from "./supabase-schema";

const ENGLISH_PASSAGE_FIELDS = "id,paper_id,year,section,passage_no,title,content,total_score,sort_order,created_at,updated_at";
const ENGLISH_QUESTION_FIELDS = "id,passage_id,question_no,stem,options,standard_answer,score,sort_order,created_at,updated_at";
const ENGLISH_ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ENGLISH_ATTEMPT_ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";

export type EnglishResultPassage = EnglishPassage & {
  displayTitle: string;
  attempt?: EnglishAttempt;
  questions: EnglishQuestion[];
};

export type EnglishResultsData = {
  passages: EnglishResultPassage[];
};

function toDate(value: string | null | undefined, fallback = new Date()): Date {
  return value ? new Date(value) : fallback;
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
    options: Array.isArray(row.options) ? row.options : [],
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

function getDisplayTitle(passage: EnglishPassage): string {
  const label = englishPassageLabels[passage.passageNo] ?? passage.passageNo;
  return `${passage.year} ${englishSectionLabels[passage.section]} ${label}`;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export const englishResultsApi = {
  async getResultsData(): Promise<EnglishResultsData> {
    const supabase = getSupabase();
    const userId = await getCurrentUserId();

    const { data: passageRows, error: passageError } = await supabase
      .from("english_passages")
      .select(ENGLISH_PASSAGE_FIELDS)
      .order("year", { ascending: false })
      .order("sort_order", { ascending: true });
    if (passageError) throw passageError;

    const passages = ((passageRows || []) as EnglishPassageRow[]).map(mapPassage);
    const passageIds = passages.map((passage) => passage.id).filter(Boolean);

    const questionRows = passageIds.length === 0
      ? []
      : await supabase
          .from("english_questions")
          .select(ENGLISH_QUESTION_FIELDS)
          .in("passage_id", passageIds)
          .order("sort_order", { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return (data || []) as EnglishQuestionRow[];
          });

    const questionsByPassageId = new Map<string, EnglishQuestion[]>();
    for (const question of questionRows.map(mapQuestion)) {
      const current = questionsByPassageId.get(question.passageId) ?? [];
      current.push(question);
      questionsByPassageId.set(question.passageId, current);
    }

    if (!userId || passageIds.length === 0) {
      return {
        passages: passages.map((passage) => ({
          ...passage,
          displayTitle: getDisplayTitle(passage),
          questions: questionsByPassageId.get(passage.id) ?? [],
        })),
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

    const attemptsByPassageId = new Map<string, EnglishAttempt>();
    for (const attemptRow of attemptRows) {
      const attempt = mapAttempt(attemptRow, answersByAttemptId.get(attemptRow.id ?? "") ?? []);
      attemptsByPassageId.set(attempt.passageId, attempt);
    }

    return {
      passages: passages.map((passage) => ({
        ...passage,
        displayTitle: getDisplayTitle(passage),
        attempt: attemptsByPassageId.get(passage.id),
        questions: questionsByPassageId.get(passage.id) ?? [],
      })),
    };
  },

};
