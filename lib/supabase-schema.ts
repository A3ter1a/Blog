import type {
  Math3SelfTestAttempt,
  Math3SelfTestDifficulty,
  Math3SelfTestMode,
  Math3SelfTestPaper,
  Math3SelfTestStatus,
} from "./math3-self-test";
import type { NoteType, PracticeResult, Problem, Profile, Subject, Video } from "./types";

export type NoteRow = {
  id?: string;
  type?: NoteType | null;
  title?: string | null;
  content?: string | null;
  subject?: Subject | null;
  tags?: string[] | null;
  cover_image?: string | null;
  videos?: Video[] | null;
  problems?: Problem[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_published?: boolean | null;
};

export type NoteInsert = Partial<NoteRow>;
export type NoteUpdate = Partial<NoteRow>;

export type ProblemPracticeStatusRow = {
  id?: string;
  user_id?: string | null;
  note_id?: string | null;
  problem_id?: string | null;
  round?: number | null;
  attempts?: number | null;
  correct_count?: number | null;
  wrong_count?: number | null;
  last_result?: PracticeResult | null;
  is_mastered?: boolean | null;
  is_marked?: boolean | null;
  last_practiced_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProblemPracticeStatusInsert = Partial<ProblemPracticeStatusRow>;
export type ProblemPracticeStatusUpdate = Partial<ProblemPracticeStatusRow>;

export type ChapterRow = {
  id?: string;
  note_id?: string | null;
  name?: string | null;
  parent_id?: string | null;
  sort_order?: number | null;
  description?: string | null;
  color?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChapterInsert = Partial<ChapterRow>;
export type ChapterUpdate = Partial<ChapterRow>;

export type SiteProfileRow = {
  id?: string;
  profile?: Profile | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SiteProfileInsert = Partial<SiteProfileRow>;
export type SiteProfileUpdate = Partial<SiteProfileRow>;

export type Math3SelfTestRow = {
  id?: string;
  user_id?: string | null;
  title?: string | null;
  mode?: Math3SelfTestMode | null;
  difficulty?: Math3SelfTestDifficulty | null;
  status?: Math3SelfTestStatus | null;
  paper?: Math3SelfTestPaper | null;
  attempt?: Math3SelfTestAttempt | null;
  score?: number | null;
  max_score?: number | null;
  started_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Math3SelfTestInsert = Partial<Math3SelfTestRow>;
export type Math3SelfTestUpdate = Partial<Math3SelfTestRow>;

export type Database = {
  public: {
    Tables: {
      notes: {
        Row: NoteRow;
        Insert: NoteInsert;
        Update: NoteUpdate;
        Relationships: [];
      };
      problem_practice_statuses: {
        Row: ProblemPracticeStatusRow;
        Insert: ProblemPracticeStatusInsert;
        Update: ProblemPracticeStatusUpdate;
        Relationships: [];
      };
      chapters: {
        Row: ChapterRow;
        Insert: ChapterInsert;
        Update: ChapterUpdate;
        Relationships: [];
      };
      site_profile: {
        Row: SiteProfileRow;
        Insert: SiteProfileInsert;
        Update: SiteProfileUpdate;
        Relationships: [];
      };
      math3_self_tests: {
        Row: Math3SelfTestRow;
        Insert: Math3SelfTestInsert;
        Update: Math3SelfTestUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
