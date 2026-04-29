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

CREATE POLICY "Users can view all chapters"
  ON chapters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert chapters"
  ON chapters FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update chapters"
  ON chapters FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete chapters"
  ON chapters FOR DELETE
  TO authenticated
  USING (true);
