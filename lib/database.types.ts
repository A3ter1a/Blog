export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      attempt_revisions: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          kind: string
          response_payload: Json
          revision_no: number
          source_snapshot: Json
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          kind: string
          response_payload: Json
          revision_no: number
          source_snapshot?: Json
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          kind?: string
          response_payload?: Json
          revision_no?: number
          source_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "attempt_revisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          abandon_reason: string | null
          abandoned_at: string | null
          created_at: string
          draft_payload: Json
          english_passage_id: string | null
          id: string
          math_paper_id: string | null
          note_content_version: number | null
          note_id: string | null
          problem_id: string | null
          round: number
          sealed_at: string | null
          source_kind: string
          started_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          abandon_reason?: string | null
          abandoned_at?: string | null
          created_at?: string
          draft_payload?: Json
          english_passage_id?: string | null
          id?: string
          math_paper_id?: string | null
          note_content_version?: number | null
          note_id?: string | null
          problem_id?: string | null
          round: number
          sealed_at?: string | null
          source_kind: string
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          abandon_reason?: string | null
          abandoned_at?: string | null
          created_at?: string
          draft_payload?: Json
          english_passage_id?: string | null
          id?: string
          math_paper_id?: string | null
          note_content_version?: number | null
          note_id?: string | null
          problem_id?: string | null
          round?: number
          sealed_at?: string | null
          source_kind?: string
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_english_passage_id_fkey"
            columns: ["english_passage_id"]
            isOneToOne: false
            referencedRelation: "english_passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_math_paper_id_fkey"
            columns: ["math_paper_id"]
            isOneToOne: false
            referencedRelation: "math_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      booklets: {
        Row: {
          created_at: string
          drift_status: string
          generated_at: string
          id: string
          last_drift_checked_at: string | null
          method_summary_confirmed_at: string
          note_id: string
          rule_version: string
          snapshot_checksum: string
          source_refs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drift_status?: string
          generated_at?: string
          id?: string
          last_drift_checked_at?: string | null
          method_summary_confirmed_at: string
          note_id: string
          rule_version: string
          snapshot_checksum: string
          source_refs: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drift_status?: string
          generated_at?: string
          id?: string
          last_drift_checked_at?: string | null
          method_summary_confirmed_at?: string
          note_id?: string
          rule_version?: string
          snapshot_checksum?: string
          source_refs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booklets_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: true
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          note_id: string | null
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          note_id?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          note_id?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      content_migration_snapshots: {
        Row: {
          after_checksum: string
          after_text: string
          ai_involved: boolean
          ai_model: string | null
          ai_provider: string | null
          ai_request_id: string | null
          batch_id: string
          before_checksum: string
          before_text: string
          created_at: string
          created_by: string
          field_path: string
          id: string
          note_content_version_after: number
          note_content_version_before: number
          note_id: string
          operation_kind: string
          reverts_snapshot_id: string | null
          rule_version: string
          validation_detail: Json
          validation_status: string
        }
        Insert: {
          after_checksum: string
          after_text: string
          ai_involved?: boolean
          ai_model?: string | null
          ai_provider?: string | null
          ai_request_id?: string | null
          batch_id: string
          before_checksum: string
          before_text: string
          created_at?: string
          created_by: string
          field_path: string
          id?: string
          note_content_version_after: number
          note_content_version_before: number
          note_id: string
          operation_kind: string
          reverts_snapshot_id?: string | null
          rule_version: string
          validation_detail?: Json
          validation_status: string
        }
        Update: {
          after_checksum?: string
          after_text?: string
          ai_involved?: boolean
          ai_model?: string | null
          ai_provider?: string | null
          ai_request_id?: string | null
          batch_id?: string
          before_checksum?: string
          before_text?: string
          created_at?: string
          created_by?: string
          field_path?: string
          id?: string
          note_content_version_after?: number
          note_content_version_before?: number
          note_id?: string
          operation_kind?: string
          reverts_snapshot_id?: string | null
          rule_version?: string
          validation_detail?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_migration_snapshots_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_migration_snapshots_reverts_snapshot_id_fkey"
            columns: ["reverts_snapshot_id"]
            isOneToOne: false
            referencedRelation: "content_migration_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      english_attempt_answers: {
        Row: {
          answer: string
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          score: number
          updated_at: string
        }
        Insert: {
          answer?: string
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          score?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "english_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "english_attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "english_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      english_attempts: {
        Row: {
          created_at: string
          id: string
          max_score: number
          passage_id: string
          score: number
          started_at: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_score?: number
          passage_id: string
          score?: number
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number
          passage_id?: string
          score?: number
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_attempts_passage_id_fkey"
            columns: ["passage_id"]
            isOneToOne: false
            referencedRelation: "english_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      english_papers: {
        Row: {
          created_at: string
          id: string
          paper_type: string
          title: string
          total_score: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          paper_type?: string
          title?: string
          total_score?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          paper_type?: string
          title?: string
          total_score?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      english_passages: {
        Row: {
          content: string
          created_at: string
          id: string
          paper_id: string
          passage_no: string
          section: string
          sort_order: number
          title: string
          total_score: number
          updated_at: string
          year: number
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          paper_id: string
          passage_no: string
          section: string
          sort_order?: number
          title?: string
          total_score?: number
          updated_at?: string
          year: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          paper_id?: string
          passage_no?: string
          section?: string
          sort_order?: number
          title?: string
          total_score?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "english_passages_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "english_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      english_questions: {
        Row: {
          created_at: string
          id: string
          options: Json
          passage_id: string
          question_no: string
          score: number
          sort_order: number
          standard_answer: string
          stem: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json
          passage_id: string
          question_no: string
          score?: number
          sort_order?: number
          standard_answer?: string
          stem?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json
          passage_id?: string
          question_no?: string
          score?: number
          sort_order?: number
          standard_answer?: string
          stem?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_questions_passage_id_fkey"
            columns: ["passage_id"]
            isOneToOne: false
            referencedRelation: "english_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      english_vocabulary: {
        Row: {
          ai_generated: boolean
          created_at: string
          definition: string
          entry_type: string
          example_sentence: string
          highlight_text: string
          id: string
          mastery_status: string
          note: string
          part_of_speech: string
          passage_id: string
          source_area: string
          source_end: number | null
          source_excerpt: string
          source_option_label: string
          source_paragraph: number | null
          source_question_id: string | null
          source_start: number | null
          updated_at: string
          user_id: string
          word: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          definition?: string
          entry_type?: string
          example_sentence?: string
          highlight_text?: string
          id?: string
          mastery_status?: string
          note?: string
          part_of_speech?: string
          passage_id: string
          source_area?: string
          source_end?: number | null
          source_excerpt?: string
          source_option_label?: string
          source_paragraph?: number | null
          source_question_id?: string | null
          source_start?: number | null
          updated_at?: string
          user_id: string
          word: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          definition?: string
          entry_type?: string
          example_sentence?: string
          highlight_text?: string
          id?: string
          mastery_status?: string
          note?: string
          part_of_speech?: string
          passage_id?: string
          source_area?: string
          source_end?: number | null
          source_excerpt?: string
          source_option_label?: string
          source_paragraph?: number | null
          source_question_id?: string | null
          source_start?: number | null
          updated_at?: string
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "english_vocabulary_passage_id_fkey"
            columns: ["passage_id"]
            isOneToOne: false
            referencedRelation: "english_passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "english_vocabulary_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "english_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          answer: string
          created_at: string
          ease_factor: number
          id: string
          interval: number
          last_review: string | null
          next_review: string
          note_id: string
          question: string
          repetition: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          ease_factor?: number
          id?: string
          interval?: number
          last_review?: string | null
          next_review?: string
          note_id: string
          question: string
          repetition?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          ease_factor?: number
          id?: string
          interval?: number
          last_review?: string | null
          next_review?: string
          note_id?: string
          question?: string
          repetition?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          breakdown: Json
          confirmation_id: string | null
          created_at: string
          feedback: string | null
          grade_seq: number
          id: string
          max_score: number
          origin: string
          revision_id: string
          score: number
          scoring_mode: string
        }
        Insert: {
          breakdown?: Json
          confirmation_id?: string | null
          created_at?: string
          feedback?: string | null
          grade_seq: number
          id?: string
          max_score: number
          origin: string
          revision_id: string
          score: number
          scoring_mode: string
        }
        Update: {
          breakdown?: Json
          confirmation_id?: string | null
          created_at?: string
          feedback?: string | null
          grade_seq?: number
          id?: string
          max_score?: number
          origin?: string
          revision_id?: string
          score?: number
          scoring_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "ocr_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "attempt_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_items: {
        Row: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          job_id: string
          lease_expires_at?: string | null
          ordinal: number
          payload?: Json
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string
          lease_expires_at?: string | null
          ordinal?: number
          payload?: Json
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          claimed_at: string | null
          created_at: string
          error: string | null
          external_task_id: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          job_class: string
          job_kind: string
          payload: Json
          progress_current: number
          progress_total: number
          provider: string | null
          result: Json | null
          source_storage_bucket: string | null
          source_storage_path: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          external_task_id?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          job_class: string
          job_kind: string
          payload?: Json
          progress_current?: number
          progress_total?: number
          provider?: string | null
          result?: Json | null
          source_storage_bucket?: string | null
          source_storage_path?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          external_task_id?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          job_class?: string
          job_kind?: string
          payload?: Json
          progress_current?: number
          progress_total?: number
          provider?: string | null
          result?: Json | null
          source_storage_bucket?: string | null
          source_storage_path?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      math_grade_steps: {
        Row: {
          created_at: string
          criterion: string
          deduction_reason: string | null
          earned_score: number
          grade_id: string
          max_score: number
          problem_id: string
          step_no: number
        }
        Insert: {
          created_at?: string
          criterion: string
          deduction_reason?: string | null
          earned_score: number
          grade_id: string
          max_score: number
          problem_id: string
          step_no: number
        }
        Update: {
          created_at?: string
          criterion?: string
          deduction_reason?: string | null
          earned_score?: number
          grade_id?: string
          max_score?: number
          problem_id?: string
          step_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "math_grade_steps_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_grade_steps_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "math_paper_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      math_paper_problems: {
        Row: {
          content_checksum: string
          content_version: number
          created_at: string
          id: string
          math_paper_id: string
          max_score: number
          problem_no: number
          problem_type: string
          prompt: string
          scoring_rubric: Json
          standard_answer: string
          updated_at: string
        }
        Insert: {
          content_checksum: string
          content_version?: number
          created_at?: string
          id?: string
          math_paper_id: string
          max_score: number
          problem_no: number
          problem_type: string
          prompt: string
          scoring_rubric: Json
          standard_answer: string
          updated_at?: string
        }
        Update: {
          content_checksum?: string
          content_version?: number
          created_at?: string
          id?: string
          math_paper_id?: string
          max_score?: number
          problem_no?: number
          problem_type?: string
          prompt?: string
          scoring_rubric?: Json
          standard_answer?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_paper_problems_math_paper_id_fkey"
            columns: ["math_paper_id"]
            isOneToOne: false
            referencedRelation: "math_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      math_papers: {
        Row: {
          created_at: string
          exam_year: number
          id: string
          paper_code: string
          source_checksum: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_year: number
          id?: string
          paper_code: string
          source_checksum: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_year?: number
          id?: string
          paper_code?: string
          source_checksum?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      math3_self_tests: {
        Row: {
          attempt: Json
          created_at: string
          difficulty: string
          id: string
          max_score: number
          mode: string
          paper: Json
          score: number
          started_at: string | null
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt?: Json
          created_at?: string
          difficulty: string
          id?: string
          max_score?: number
          mode: string
          paper: Json
          score?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt?: Json
          created_at?: string
          difficulty?: string
          id?: string
          max_score?: number
          mode?: string
          paper?: Json
          score?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      memory_candidates: {
        Row: {
          content: string
          created_at: string
          decided_at: string | null
          id: string
          reason: string
          source_path: string
          status: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          decided_at?: string | null
          id: string
          reason: string
          source_path: string
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          reason?: string
          source_path?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          content_version: number
          cover_image: string | null
          created_at: string
          id: string
          is_published: boolean
          problems: Json
          subject: Database["public"]["Enums"]["subject"] | null
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["note_type"]
          updated_at: string
          videos: Json
        }
        Insert: {
          content?: string
          content_version?: number
          cover_image?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          problems?: Json
          subject?: Database["public"]["Enums"]["subject"] | null
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["note_type"]
          updated_at?: string
          videos?: Json
        }
        Update: {
          content?: string
          content_version?: number
          cover_image?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          problems?: Json
          subject?: Database["public"]["Enums"]["subject"] | null
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["note_type"]
          updated_at?: string
          videos?: Json
        }
        Relationships: []
      }
      ocr_confirmations: {
        Row: {
          attempt_id: string
          confirmation_version: number
          confirmed_at: string
          confirmed_checksum: string
          confirmed_payload: Json
          created_at: string
          id: string
          raw_checksum: string
          raw_payload: Json
          revision_id: string
        }
        Insert: {
          attempt_id: string
          confirmation_version: number
          confirmed_at?: string
          confirmed_checksum: string
          confirmed_payload: Json
          created_at?: string
          id: string
          raw_checksum: string
          raw_payload: Json
          revision_id: string
        }
        Update: {
          attempt_id?: string
          confirmation_version?: number
          confirmed_at?: string
          confirmed_checksum?: string
          confirmed_payload?: Json
          created_at?: string
          id?: string
          raw_checksum?: string
          raw_payload?: Json
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_confirmations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_confirmations_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: true
            referencedRelation: "attempt_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_task_status: {
        Row: {
          created_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      problem_practice_statuses: {
        Row: {
          attempts: number
          correct_count: number
          created_at: string
          id: string
          is_marked: boolean
          is_mastered: boolean
          last_practiced_at: string | null
          last_result: string | null
          note_id: string
          problem_id: string
          round: number
          updated_at: string
          user_id: string
          wrong_count: number
        }
        Insert: {
          attempts?: number
          correct_count?: number
          created_at?: string
          id?: string
          is_marked?: boolean
          is_mastered?: boolean
          last_practiced_at?: string | null
          last_result?: string | null
          note_id: string
          problem_id: string
          round?: number
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Update: {
          attempts?: number
          correct_count?: number
          created_at?: string
          id?: string
          is_marked?: boolean
          is_mastered?: boolean
          last_practiced_at?: string | null
          last_result?: string | null
          note_id?: string
          problem_id?: string
          round?: number
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "problem_practice_statuses_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          chunk_no: number
          content: string
          created_at: string
          embedding: string
          href: string
          id: string
          search_vector: unknown
          source_label: string
          source_version_id: string
        }
        Insert: {
          chunk_no: number
          content: string
          created_at?: string
          embedding: string
          href: string
          id?: string
          search_vector?: unknown
          source_label: string
          source_version_id: string
        }
        Update: {
          chunk_no?: number
          content?: string
          created_at?: string
          embedding?: string
          href?: string
          id?: string
          search_vector?: unknown
          source_label?: string
          source_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_profile: {
        Row: {
          created_at: string
          id: string
          profile: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile?: Json
          updated_at?: string
        }
        Relationships: []
      }
      source_documents: {
        Row: {
          created_at: string
          current_version_id: string | null
          display_name: string
          id: string
          metadata: Json
          note_id: string | null
          ownership_kind: string
          source_kind: string
          source_uri: string | null
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          display_name: string
          id?: string
          metadata?: Json
          note_id?: string | null
          ownership_kind: string
          source_kind: string
          source_uri?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          display_name?: string
          id?: string
          metadata?: Json
          note_id?: string | null
          ownership_kind?: string
          source_kind?: string
          source_uri?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_current_version_fkey"
            columns: ["id", "current_version_id"]
            isOneToOne: false
            referencedRelation: "source_versions"
            referencedColumns: ["source_document_id", "id"]
          },
          {
            foreignKeyName: "source_documents_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      source_versions: {
        Row: {
          captured_at: string
          checksum: string
          created_at: string
          id: string
          note_content_version: number | null
          raw_text: string
          source_document_id: string
          source_metadata: Json
          structure: Json
          version_no: number
        }
        Insert: {
          captured_at?: string
          checksum: string
          created_at?: string
          id?: string
          note_content_version?: number | null
          raw_text: string
          source_document_id: string
          source_metadata?: Json
          structure?: Json
          version_no: number
        }
        Update: {
          captured_at?: string
          checksum?: string
          created_at?: string
          id?: string
          note_content_version?: number | null
          raw_text?: string
          source_document_id?: string
          source_metadata?: Json
          structure?: Json
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_versions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_content_migration: {
        Args: {
          p_after_checksum: string
          p_after_text: string
          p_ai_involved?: boolean
          p_ai_model?: string
          p_ai_provider?: string
          p_ai_request_id?: string
          p_batch_id: string
          p_before_checksum: string
          p_expected_note_version: number
          p_field_path: string
          p_note_id: string
          p_rule_version: string
          p_validation_detail?: Json
          p_validation_status?: string
        }
        Returns: {
          after_checksum: string
          after_text: string
          ai_involved: boolean
          ai_model: string | null
          ai_provider: string | null
          ai_request_id: string | null
          batch_id: string
          before_checksum: string
          before_text: string
          created_at: string
          created_by: string
          field_path: string
          id: string
          note_content_version_after: number
          note_content_version_before: number
          note_id: string
          operation_kind: string
          reverts_snapshot_id: string | null
          rule_version: string
          validation_detail: Json
          validation_status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "content_migration_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_job_item: {
        Args: {
          p_job_id: string
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job_item: {
        Args: {
          p_item_id: string
          p_lease_attempt: number
          p_result?: Json
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_english_subjective_grade: {
        Args: {
          p_breakdown: Json
          p_command_id: string
          p_feedback: string
          p_revision_id: string
          p_score: number
          p_write_legacy: boolean
        }
        Returns: Json
      }
      confirm_math_grade: {
        Args: {
          p_breakdown: Json
          p_command_id: string
          p_feedback: string
          p_score: number
          p_steps: Json
          p_suggestion_grade_id: string
        }
        Returns: Json
      }
      create_private_booklet: {
        Args: {
          p_command_id: string
          p_content: string
          p_method_summary_confirmed: boolean
          p_rule_version: string
          p_snapshot_checksum: string
          p_source_refs: Json
          p_title: string
        }
        Returns: Json
      }
      decide_assistant_memory: {
        Args: { p_candidate_id: string; p_decision: string }
        Returns: Json
      }
      enqueue_job_item: {
        Args: {
          p_idempotency_key: string
          p_job_id: string
          p_ordinal: number
          p_payload?: Json
        }
        Returns: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fail_job_item: {
        Args: {
          p_error: string
          p_item_id: string
          p_lease_attempt: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_math_grade_source: {
        Args: { p_confirmation_id: string }
        Returns: Json
      }
      get_math_training_state: {
        Args: { p_math_paper_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      list_assistant_memories: { Args: never; Returns: Json }
      list_math_papers: { Args: never; Returns: Json }
      propose_assistant_memory: {
        Args: {
          p_command_id: string
          p_content: string
          p_reason: string
          p_source_path: string
        }
        Returns: Json
      }
      record_english_subjective_submission: {
        Args: {
          p_answers: Json
          p_breakdown: Json
          p_command_id: string
          p_feedback: string
          p_passage_id: string
          p_round: number
          p_suggested_score: number
        }
        Returns: Json
      }
      record_english_training_command: {
        Args: {
          p_action: string
          p_answers: Json
          p_command_id: string
          p_passage_id: string
          p_round: number
          p_write_legacy: boolean
        }
        Returns: Json
      }
      record_math_ai_grade: {
        Args: {
          p_breakdown: Json
          p_command_id: string
          p_confirmation_id: string
          p_feedback: string
          p_max_score: number
          p_score: number
          p_steps: Json
        }
        Returns: Json
      }
      record_math_ocr_confirmation: {
        Args: {
          p_attempt_id: string
          p_command_id: string
          p_confirmed_payload: Json
          p_raw_payload: Json
        }
        Returns: Json
      }
      refresh_booklet_drift: { Args: { p_booklet_id: string }; Returns: Json }
      reset_failed_job_item: {
        Args: { p_item_id: string }
        Returns: {
          attempt_count: number
          claimed_by: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          lease_expires_at: string | null
          ordinal: number
          payload: Json
          result: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rollback_content_migration: {
        Args: {
          p_batch_id: string
          p_expected_note_version: number
          p_snapshot_id: string
          p_validation_detail?: Json
        }
        Returns: {
          after_checksum: string
          after_text: string
          ai_involved: boolean
          ai_model: string | null
          ai_provider: string | null
          ai_request_id: string | null
          batch_id: string
          before_checksum: string
          before_text: string
          created_at: string
          created_by: string
          field_path: string
          id: string
          note_content_version_after: number
          note_content_version_before: number
          note_id: string
          operation_kind: string
          reverts_snapshot_id: string | null
          rule_version: string
          validation_detail: Json
          validation_status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "content_migration_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_private_note_rag: {
        Args: {
          p_limit?: number
          p_note_id?: string
          p_query: string
          p_query_embedding: string
        }
        Returns: Json
      }
      start_math_paper_attempt: {
        Args: { p_command_id: string; p_math_paper_id: string; p_round: number }
        Returns: Json
      }
      sync_private_note_rag: {
        Args: {
          p_checksum: string
          p_chunks: Json
          p_note_content_version: number
          p_note_id: string
          p_raw_text: string
        }
        Returns: Json
      }
    }
    Enums: {
      difficulty: "easy" | "medium" | "hard"
      note_type: "note" | "problem" | "essay"
      problem_type: "choice" | "fill" | "calculation" | "proof" | "proofEssay"
      subject: "math" | "english" | "politics" | "economics"
      video_platform: "bilibili" | "youtube"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      difficulty: ["easy", "medium", "hard"],
      note_type: ["note", "problem", "essay"],
      problem_type: ["choice", "fill", "calculation", "proof", "proofEssay"],
      subject: ["math", "english", "politics", "economics"],
      video_platform: ["bilibili", "youtube"],
    },
  },
} as const
