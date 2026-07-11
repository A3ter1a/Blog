import { assertAdminWrite, getSupabase } from "./supabase";
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
import {
  isEnglishObjectiveSection,
  normalizeEnglishObjectiveAnswer,
} from "./english-training";

const ENGLISH_PAPER_FIELDS = "id,year,paper_type,title,total_score,created_at,updated_at";
const ENGLISH_PASSAGE_FIELDS = "id,paper_id,year,section,passage_no,title,content,total_score,sort_order,created_at,updated_at";
const ENGLISH_QUESTION_FIELDS = "id,passage_id,question_no,stem,options,standard_answer,score,sort_order,created_at,updated_at";
const ENGLISH_ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ENGLISH_ATTEMPT_ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";

export type EnglishAttemptAnswerInput = Record<string, string>;

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

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

function getQuestionScore(
  passage: EnglishPassage,
  question: EnglishQuestion,
  answer: string,
  submitted: boolean,
): { isCorrect?: boolean; score: number } {
  if (!submitted || !isEnglishObjectiveSection(passage.section)) return { score: 0 };
  const expected = normalizeEnglishObjectiveAnswer(question.standardAnswer);
  const actual = normalizeEnglishObjectiveAnswer(answer);
  if (!expected || !actual) return { isCorrect: false, score: 0 };
  const isCorrect = expected === actual;
  return { isCorrect, score: isCorrect ? question.score : 0 };
}

export const englishTrainingApi = {
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
    questions,
    answers,
    submitted,
    currentAttempt,
  }: {
    passage: EnglishPassage;
    questions: EnglishQuestion[];
    answers: EnglishAttemptAnswerInput;
    submitted: boolean;
    currentAttempt?: EnglishAttempt;
  }): Promise<EnglishAttempt> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const maxScore = questions.reduce((sum, question) => sum + question.score, 0);
    const graded = questions.map((question) => ({
      question,
      answer: answers[question.id] ?? "",
      grade: getQuestionScore(passage, question, answers[question.id] ?? "", submitted),
    }));
    const keepSubmitted = currentAttempt?.status === "submitted" && !submitted;
    const totalScore = submitted
      ? graded.reduce((sum, item) => sum + item.grade.score, 0)
      : currentAttempt?.score ?? 0;

    const attemptPayload: EnglishAttemptInsert = {
      user_id: userId,
      passage_id: passage.id,
      status: submitted || keepSubmitted ? "submitted" : "in_progress",
      score: totalScore,
      max_score: maxScore,
      started_at: currentAttempt?.startedAt.toISOString() ?? now,
      submitted_at: submitted ? now : currentAttempt?.submittedAt?.toISOString(),
      created_at: currentAttempt ? undefined : now,
      updated_at: now,
    };

    const { data: attemptData, error: attemptError } = await supabase
      .from("english_attempts")
      .upsert(attemptPayload, { onConflict: "user_id,passage_id" })
      .select(ENGLISH_ATTEMPT_FIELDS)
      .single();
    if (attemptError) throw attemptError;

    const attempt = mapAttempt(attemptData as EnglishAttemptRow);
    const answerPayloads: EnglishAttemptAnswerInsert[] = graded.map(({ question, answer, grade }) => ({
      attempt_id: attempt.id,
      question_id: question.id,
      answer,
      is_correct: keepSubmitted
        ? currentAttempt?.answers.find((item) => item.questionId === question.id)?.isCorrect
        : grade.isCorrect,
      score: keepSubmitted
        ? currentAttempt?.answers.find((item) => item.questionId === question.id)?.score ?? 0
        : grade.score,
      updated_at: now,
      created_at: currentAttempt ? undefined : now,
    }));

    if (answerPayloads.length > 0) {
      const { data: answerData, error: answerError } = await supabase
        .from("english_attempt_answers")
        .upsert(answerPayloads, { onConflict: "attempt_id,question_id" })
        .select(ENGLISH_ATTEMPT_ANSWER_FIELDS);
      if (answerError) throw answerError;
      attempt.answers = ((answerData || []) as EnglishAttemptAnswerRow[]).map(mapAttemptAnswer);
    }

    return attempt;
  },
};
