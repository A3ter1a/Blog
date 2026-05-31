-- Notes list/search performance indexes for production.
-- Run this once in the Supabase SQL Editor.

CREATE INDEX IF NOT EXISTS idx_notes_public_created_at
  ON public.notes (created_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_notes_public_type_created_at
  ON public.notes (type, created_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_notes_public_subject_created_at
  ON public.notes (subject, created_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_notes_tags_gin
  ON public.notes
  USING gin (tags);
