-- Problem practice status table.
-- Run this SQL in your Supabase SQL Editor before using /practice.

CREATE TABLE IF NOT EXISTS public.problem_practice_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  problem_id text NOT NULL,
  round integer NOT NULL DEFAULT 0 CHECK (round >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count integer NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  last_result text CHECK (last_result IN ('correct', 'wrong', 'skipped')),
  is_mastered boolean NOT NULL DEFAULT false,
  last_practiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, note_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_problem_practice_user_note
  ON public.problem_practice_statuses (user_id, note_id);

CREATE INDEX IF NOT EXISTS idx_problem_practice_last_practiced
  ON public.problem_practice_statuses (user_id, last_practiced_at DESC);

ALTER TABLE public.problem_practice_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_practice_statuses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_problem_practice_statuses"
  ON public.problem_practice_statuses;
DROP POLICY IF EXISTS "admin_insert_problem_practice_statuses"
  ON public.problem_practice_statuses;
DROP POLICY IF EXISTS "admin_update_problem_practice_statuses"
  ON public.problem_practice_statuses;
DROP POLICY IF EXISTS "admin_delete_problem_practice_statuses"
  ON public.problem_practice_statuses;

CREATE POLICY "admin_read_problem_practice_statuses"
  ON public.problem_practice_statuses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_admin());

CREATE POLICY "admin_insert_problem_practice_statuses"
  ON public.problem_practice_statuses
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_admin());

CREATE POLICY "admin_update_problem_practice_statuses"
  ON public.problem_practice_statuses
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_admin());

CREATE POLICY "admin_delete_problem_practice_statuses"
  ON public.problem_practice_statuses
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_admin());
