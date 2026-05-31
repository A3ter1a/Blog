-- Production RLS lockdown for Asteroid.
-- Run this in the Supabase SQL Editor after you confirm the project is deployed publicly.
--
-- Goal:
-- - Visitors can read published notes.
-- - Visitors can read only chapters needed by published notes plus global templates.
-- - Visitors cannot create, update, or delete notes, chapters, or flashcards.
-- - Authenticated admins can create, update, and delete private content.
-- - Flashcards are private to admins.
--
-- Important:
-- This script intentionally removes all existing policies on the target tables
-- before creating the production read-only baseline.
--
-- Before or after running this script, add your Supabase Auth email as admin:
-- insert into public.admin_users (email)
-- values ('your-admin-email@example.com')
-- on conflict (email) do nothing;

BEGIN;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('notes', 'chapters', 'flashcards', 'admin_users')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END $$;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chapters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE lower(admin_users.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE POLICY "public_read_published_notes"
  ON public.notes
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "admin_read_notes"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_notes"
  ON public.notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_notes"
  ON public.notes
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_notes"
  ON public.notes
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "public_read_visible_chapters"
  ON public.chapters
  FOR SELECT
  TO anon, authenticated
  USING (
    note_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.notes
      WHERE notes.id = chapters.note_id
        AND notes.is_published = true
    )
  );

CREATE POLICY "admin_read_chapters"
  ON public.chapters
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_chapters"
  ON public.chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_chapters"
  ON public.chapters
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_chapters"
  ON public.chapters
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_read_flashcards"
  ON public.flashcards
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_flashcards"
  ON public.flashcards
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_flashcards"
  ON public.flashcards
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_flashcards"
  ON public.flashcards
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_read_admin_users"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMIT;

-- Optional verification queries:
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('notes', 'chapters', 'flashcards', 'admin_users')
-- order by tablename, policyname;
--
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class
-- where oid in (
--   'public.notes'::regclass,
--   'public.chapters'::regclass,
--   'public.flashcards'::regclass,
--   'public.admin_users'::regclass
-- )
-- order by relname;
