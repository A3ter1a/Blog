-- Chapters table for hierarchical problem classification
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE, -- NULL = global template
  name TEXT NOT NULL,
  parent_id UUID REFERENCES chapters(id) ON DELETE SET NULL, -- NULL = root chapter
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chapters_note_id ON chapters(note_id);
CREATE INDEX IF NOT EXISTS idx_chapters_parent_id ON chapters(parent_id);
CREATE INDEX IF NOT EXISTS idx_chapters_sort_order ON chapters(sort_order);

-- Row Level Security (RLS)
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

-- Allow anon (no auth used in this project) + authenticated
CREATE POLICY "Allow all SELECT on chapters"
  ON chapters FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all INSERT on chapters"
  ON chapters FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on chapters"
  ON chapters FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all DELETE on chapters"
  ON chapters FOR DELETE
  TO anon, authenticated
  USING (true);
