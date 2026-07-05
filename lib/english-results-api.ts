import { assertAdminWrite, getSupabase } from "./supabase";
import {
  englishPassageLabels,
  englishSectionLabels,
  type EnglishAttempt,
  type EnglishAttemptAnswer,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishSection,
  type EnglishVocabularyEntry,
  type EnglishVocabularyEntryType,
  type EnglishVocabularyMasteryStatus,
  type EnglishVocabularyPartOfSpeech,
  type EnglishVocabularySourceArea,
} from "./english-training";
import type {
  EnglishAttemptAnswerRow,
  EnglishAttemptRow,
  EnglishPassageRow,
  EnglishQuestionRow,
  EnglishVocabularyInsert,
  EnglishVocabularyRow,
} from "./supabase-schema";

const ENGLISH_PASSAGE_FIELDS = "id,paper_id,year,section,passage_no,title,content,total_score,sort_order,created_at,updated_at";
const ENGLISH_QUESTION_FIELDS = "id,passage_id,question_no,stem,options,standard_answer,score,sort_order,created_at,updated_at";
const ENGLISH_ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ENGLISH_ATTEMPT_ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";
const ENGLISH_VOCABULARY_FIELDS = "id,user_id,passage_id,entry_type,word,part_of_speech,definition,example_sentence,source_area,source_question_id,source_option_label,source_excerpt,highlight_text,source_start,source_end,source_paragraph,ai_generated,mastery_status,note,created_at,updated_at";

export type EnglishVocabularyInput = {
  passageId: string;
  entryType: EnglishVocabularyEntryType;
  word: string;
  partOfSpeech: EnglishVocabularyPartOfSpeech;
  definition?: string;
  exampleSentence?: string;
  sourceArea?: EnglishVocabularySourceArea;
  sourceQuestionId?: string;
  sourceOptionLabel?: string;
  sourceExcerpt?: string;
  highlightText?: string;
  sourceStart?: number;
  sourceEnd?: number;
  sourceParagraph?: number;
  aiGenerated?: boolean;
  masteryStatus?: EnglishVocabularyMasteryStatus;
  note?: string;
};

export type EnglishResultPassage = EnglishPassage & {
  displayTitle: string;
  attempt?: EnglishAttempt;
  questions: EnglishQuestion[];
};

export type EnglishResultsData = {
  passages: EnglishResultPassage[];
  vocabulary: EnglishVocabularyEntry[];
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

function mapVocabulary(row: EnglishVocabularyRow): EnglishVocabularyEntry {
  const createdAt = toDate(row.created_at);
  return {
    id: row.id ?? "",
    userId: row.user_id ?? undefined,
    passageId: row.passage_id ?? "",
    entryType: row.entry_type ?? "word",
    word: row.word ?? "",
    partOfSpeech: row.part_of_speech ?? "other",
    definition: row.definition ?? "",
    exampleSentence: row.example_sentence ?? "",
    sourceArea: row.source_area ?? "passage",
    sourceQuestionId: row.source_question_id ?? undefined,
    sourceOptionLabel: row.source_option_label ?? "",
    sourceExcerpt: row.source_excerpt ?? row.example_sentence ?? "",
    highlightText: row.highlight_text ?? "",
    sourceStart: row.source_start ?? undefined,
    sourceEnd: row.source_end ?? undefined,
    sourceParagraph: row.source_paragraph ?? undefined,
    aiGenerated: row.ai_generated ?? false,
    masteryStatus: row.mastery_status ?? "new",
    note: row.note ?? "",
    createdAt,
    updatedAt: toDate(row.updated_at, createdAt),
  };
}

function getDisplayTitle(passage: EnglishPassage): string {
  const label = englishPassageLabels[passage.passageNo] ?? passage.passageNo;
  return `${passage.year} ${englishSectionLabels[passage.section]} ${label}`;
}

function isMissingColumnError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "42703",
  );
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

async function fetchVocabulary(userId: string, passageIds: string[]): Promise<EnglishVocabularyEntry[]> {
  if (passageIds.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("english_vocabulary")
    .select(ENGLISH_VOCABULARY_FIELDS)
    .eq("user_id", userId)
    .in("passage_id", passageIds)
    .order("updated_at", { ascending: false });

  if (!error) return ((data || []) as EnglishVocabularyRow[]).map(mapVocabulary);
  if (!isMissingColumnError(error)) throw error;

  const fallbackFields = "id,user_id,passage_id,word,part_of_speech,definition,example_sentence,mastery_status,note,created_at,updated_at";
  const fallback = await supabase
    .from("english_vocabulary")
    .select(fallbackFields)
    .eq("user_id", userId)
    .in("passage_id", passageIds)
    .order("updated_at", { ascending: false });
  if (fallback.error) throw fallback.error;
  return ((fallback.data || []) as EnglishVocabularyRow[]).map(mapVocabulary);
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
        vocabulary: [],
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
      vocabulary: await fetchVocabulary(userId, passageIds),
    };
  },

  async saveVocabulary(input: EnglishVocabularyInput): Promise<EnglishVocabularyEntry> {
    const userId = await assertAdminWrite();
    const now = new Date().toISOString();
    const payload: EnglishVocabularyInsert = {
      user_id: userId,
      passage_id: input.passageId,
      entry_type: input.entryType,
      word: input.word.trim(),
      part_of_speech: input.partOfSpeech,
      definition: input.definition?.trim() ?? "",
      example_sentence: input.exampleSentence?.trim() ?? "",
      source_area: input.sourceArea ?? "passage",
      source_question_id: input.sourceQuestionId || undefined,
      source_option_label: input.sourceOptionLabel?.trim() ?? "",
      source_excerpt: input.sourceExcerpt?.trim() ?? "",
      highlight_text: input.highlightText?.trim() ?? "",
      source_start: input.sourceStart,
      source_end: input.sourceEnd,
      source_paragraph: input.sourceParagraph,
      ai_generated: input.aiGenerated ?? false,
      mastery_status: input.masteryStatus ?? "new",
      note: input.note?.trim() ?? "",
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await getSupabase()
      .from("english_vocabulary")
      .insert(payload)
      .select(ENGLISH_VOCABULARY_FIELDS)
      .single();

    if (error) throw error;
    return mapVocabulary(data as EnglishVocabularyRow);
  },

  async updateVocabulary(id: string, input: EnglishVocabularyInput): Promise<EnglishVocabularyEntry> {
    await assertAdminWrite();
    const payload: EnglishVocabularyInsert = {
      passage_id: input.passageId,
      entry_type: input.entryType,
      word: input.word.trim(),
      part_of_speech: input.partOfSpeech,
      definition: input.definition?.trim() ?? "",
      example_sentence: input.exampleSentence?.trim() ?? "",
      source_area: input.sourceArea ?? "passage",
      source_question_id: input.sourceQuestionId || null,
      source_option_label: input.sourceOptionLabel?.trim() ?? "",
      source_excerpt: input.sourceExcerpt?.trim() ?? "",
      highlight_text: input.highlightText?.trim() ?? "",
      source_start: input.sourceStart,
      source_end: input.sourceEnd,
      source_paragraph: input.sourceParagraph,
      ai_generated: input.aiGenerated ?? false,
      mastery_status: input.masteryStatus ?? "new",
      note: input.note?.trim() ?? "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await getSupabase()
      .from("english_vocabulary")
      .update(payload)
      .eq("id", id)
      .select(ENGLISH_VOCABULARY_FIELDS)
      .single();

    if (error) throw error;
    return mapVocabulary(data as EnglishVocabularyRow);
  },

  async deleteVocabulary(id: string): Promise<void> {
    await assertAdminWrite();
    const { error } = await getSupabase()
      .from("english_vocabulary")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};
