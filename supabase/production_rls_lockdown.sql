-- Production RLS lockdown for Asteroid.
-- Run this in the Supabase SQL Editor after you confirm the project is deployed publicly.
--
-- Goal:
-- - Visitors can read published notes.
-- - Visitors can read only chapters needed by published notes plus global templates.
-- - Visitors can read the public About page profile.
-- - Visitors cannot create, update, or delete notes, chapters, or flashcards.
-- - Authenticated admins can create, update, and delete private content.
-- - Flashcards are private to admins.
-- - Note images are publicly readable but writable only by admins.
--
-- Important:
-- This script intentionally removes all existing policies on the target tables
-- before creating the production read-only baseline.
-- It also resets policies on storage.objects because permissive storage policies
-- would override the note-images restrictions below. If you add other buckets,
-- create explicit policies for them after running this script.
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
    WHERE (schemaname = 'public'
      AND tablename IN ('notes', 'chapters', 'flashcards', 'admin_users', 'site_profile'))
      OR (schemaname = 'storage' AND tablename = 'objects')
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

CREATE TABLE IF NOT EXISTS public.site_profile (
  id text PRIMARY KEY DEFAULT 'main',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_profile_singleton CHECK (id = 'main')
);

INSERT INTO public.site_profile (id, profile)
VALUES (
  'main',
  jsonb_build_object(
    'name', 'A3ter1a',
    'avatar', '',
    'tagline', '博观而约取，厚积而薄发。在这场孤独的修行中，我们终将听见远方的回响。',
    'badges', jsonb_build_array('星月女神 Asteria', '考研人 | 数学 · 英语 · 政治 · 经济学'),
    'links', jsonb_build_array(
      jsonb_build_object('name', 'QQ', 'icon', 'qq', 'href', '', 'variant', 'default', 'linkType', 'number'),
      jsonb_build_object('name', '微信', 'icon', 'wechat', 'href', '', 'variant', 'secondary', 'linkType', 'number'),
      jsonb_build_object('name', 'B站', 'icon', 'bilibili', 'href', '#', 'variant', 'dark', 'linkType', 'link'),
      jsonb_build_object('name', 'Github', 'icon', 'github', 'href', '#', 'variant', 'primary', 'linkType', 'link')
    ),
    'footer', 'Asteroid — 知识的沉淀与共鸣'
  )
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_profile ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chapters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.site_profile FORCE ROW LEVEL SECURITY;

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

CREATE POLICY "public_read_site_profile"
  ON public.site_profile
  FOR SELECT
  TO anon, authenticated
  USING (id = 'main');

CREATE POLICY "admin_insert_site_profile"
  ON public.site_profile
  FOR INSERT
  TO authenticated
  WITH CHECK (id = 'main' AND public.is_admin());

CREATE POLICY "admin_update_site_profile"
  ON public.site_profile
  FOR UPDATE
  TO authenticated
  USING (id = 'main' AND public.is_admin())
  WITH CHECK (id = 'main' AND public.is_admin());

CREATE POLICY "admin_delete_site_profile"
  ON public.site_profile
  FOR DELETE
  TO authenticated
  USING (id = 'main' AND public.is_admin());

CREATE POLICY "public_read_note_images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'note-images');

CREATE POLICY "admin_insert_note_images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'note-images' AND public.is_admin());

CREATE POLICY "admin_update_note_images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'note-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'note-images' AND public.is_admin());

CREATE POLICY "admin_delete_note_images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'note-images' AND public.is_admin());

COMMIT;

-- Optional verification queries:
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('notes', 'chapters', 'flashcards', 'admin_users', 'site_profile')
-- order by tablename, policyname;
--
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'storage'
--   and tablename = 'objects'
-- order by policyname;
--
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class
-- where oid in (
--   'public.notes'::regclass,
--   'public.chapters'::regclass,
--   'public.flashcards'::regclass,
--   'public.admin_users'::regclass,
--   'public.site_profile'::regclass
-- )
-- order by relname;
