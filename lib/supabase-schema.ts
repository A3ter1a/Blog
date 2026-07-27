import type {
  EnglishAttemptStatus,
  EnglishPaperType,
  EnglishPassageNo,
  EnglishQuestionOption,
  EnglishSection,
} from "./english-training";
import type { Database as GeneratedDatabase, Tables, TablesInsert, TablesUpdate } from "./database.types";
import type { PracticeResult } from "./types";

export type { CompositeTypes, Enums, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";

// The generated shadow schema is the only database source of truth. This file only
// adds domain meaning to JSON/string fields and keeps partial-select call sites ergonomic.
export type Database = GeneratedDatabase;

type PublicTableName = keyof GeneratedDatabase["public"]["Tables"];
type DomainOverride<T, Override> = Omit<T, keyof Override> & Override;
type SelectedRow<Name extends PublicTableName> = Partial<Tables<Name>>;
type SelectedInsert<Name extends PublicTableName> = TablesInsert<Name>;
type SelectedUpdate<Name extends PublicTableName> = TablesUpdate<Name>;

type EnglishVocabularyEntryType = "word" | "collocation" | "familiar_meaning";
type EnglishVocabularyPartOfSpeech = "n" | "v" | "adj" | "adv" | "prep" | "conj" | "phr" | "other";
type EnglishVocabularyMasteryStatus = "new" | "learning" | "mastered";
type EnglishVocabularySourceArea = "passage" | "question" | "option";

export type NoteRow = SelectedRow<"notes">;
export type NoteInsert = SelectedInsert<"notes">;
export type NoteUpdate = SelectedUpdate<"notes">;

export type AdminUserRow = SelectedRow<"admin_users">;
export type AdminUserInsert = SelectedInsert<"admin_users">;
export type AdminUserUpdate = SelectedUpdate<"admin_users">;

type PlanningTaskStatusFields = {
  status?: "not_started" | "in_progress" | "completed";
};

export type PlanningTaskStatusRow = DomainOverride<SelectedRow<"planning_task_status">, PlanningTaskStatusFields>;
export type PlanningTaskStatusInsert = DomainOverride<SelectedInsert<"planning_task_status">, PlanningTaskStatusFields>;
export type PlanningTaskStatusUpdate = DomainOverride<SelectedUpdate<"planning_task_status">, PlanningTaskStatusFields>;

type ProblemPracticeStatusFields = {
  last_result?: PracticeResult | null;
};

export type ProblemPracticeStatusRow = DomainOverride<SelectedRow<"problem_practice_statuses">, ProblemPracticeStatusFields>;
export type ProblemPracticeStatusInsert = DomainOverride<SelectedInsert<"problem_practice_statuses">, ProblemPracticeStatusFields>;
export type ProblemPracticeStatusUpdate = DomainOverride<SelectedUpdate<"problem_practice_statuses">, ProblemPracticeStatusFields>;

export type ChapterRow = SelectedRow<"chapters">;
export type ChapterInsert = SelectedInsert<"chapters">;
export type ChapterUpdate = SelectedUpdate<"chapters">;

export type SiteProfileRow = SelectedRow<"site_profile">;
export type SiteProfileInsert = SelectedInsert<"site_profile">;
export type SiteProfileUpdate = SelectedUpdate<"site_profile">;

export type Math3SelfTestRow = SelectedRow<"math3_self_tests">;
export type Math3SelfTestInsert = SelectedInsert<"math3_self_tests">;
export type Math3SelfTestUpdate = SelectedUpdate<"math3_self_tests">;

type EnglishPaperFields = {
  paper_type?: EnglishPaperType;
};

export type EnglishPaperRow = DomainOverride<SelectedRow<"english_papers">, EnglishPaperFields>;
export type EnglishPaperInsert = DomainOverride<SelectedInsert<"english_papers">, EnglishPaperFields>;
export type EnglishPaperUpdate = DomainOverride<SelectedUpdate<"english_papers">, EnglishPaperFields>;

type EnglishPassageFields = {
  section?: EnglishSection;
  passage_no?: EnglishPassageNo;
};

export type EnglishPassageRow = DomainOverride<SelectedRow<"english_passages">, EnglishPassageFields>;
export type EnglishPassageInsert = DomainOverride<SelectedInsert<"english_passages">, EnglishPassageFields>;
export type EnglishPassageUpdate = DomainOverride<SelectedUpdate<"english_passages">, EnglishPassageFields>;

type EnglishQuestionFields = {
  options?: EnglishQuestionOption[];
};

export type EnglishQuestionRow = SelectedRow<"english_questions">;
export type EnglishQuestionInsert = DomainOverride<SelectedInsert<"english_questions">, EnglishQuestionFields>;
export type EnglishQuestionUpdate = DomainOverride<SelectedUpdate<"english_questions">, EnglishQuestionFields>;

type EnglishAttemptFields = {
  status?: EnglishAttemptStatus;
};

export type EnglishAttemptRow = DomainOverride<SelectedRow<"english_attempts">, EnglishAttemptFields>;
export type EnglishAttemptInsert = DomainOverride<SelectedInsert<"english_attempts">, EnglishAttemptFields>;
export type EnglishAttemptUpdate = DomainOverride<SelectedUpdate<"english_attempts">, EnglishAttemptFields>;

export type EnglishAttemptAnswerRow = SelectedRow<"english_attempt_answers">;
export type EnglishAttemptAnswerInsert = SelectedInsert<"english_attempt_answers">;
export type EnglishAttemptAnswerUpdate = SelectedUpdate<"english_attempt_answers">;

type EnglishVocabularyFields = {
  entry_type?: EnglishVocabularyEntryType;
  part_of_speech?: EnglishVocabularyPartOfSpeech | null;
  source_area?: EnglishVocabularySourceArea;
  mastery_status?: EnglishVocabularyMasteryStatus;
};

export type EnglishVocabularyRow = DomainOverride<SelectedRow<"english_vocabulary">, EnglishVocabularyFields>;
export type EnglishVocabularyInsert = DomainOverride<SelectedInsert<"english_vocabulary">, EnglishVocabularyFields>;
export type EnglishVocabularyUpdate = DomainOverride<SelectedUpdate<"english_vocabulary">, EnglishVocabularyFields>;
