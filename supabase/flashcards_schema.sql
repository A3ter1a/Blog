-- Flashcards table for spaced repetition system
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  
  -- SM-2 Algorithm fields
  interval INTEGER NOT NULL DEFAULT 1, -- Days until next review
  repetition INTEGER NOT NULL DEFAULT 0, -- Number of consecutive successful reviews
  ease_factor FLOAT NOT NULL DEFAULT 2.5, -- Difficulty multiplier
  
  -- Review tracking
  next_review TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_review TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for fast lookups of due cards
CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(next_review);
CREATE INDEX IF NOT EXISTS idx_flashcards_note_id ON flashcards(note_id);

-- Row Level Security (RLS) policies
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- Allow anon (no auth used in this project) + authenticated
CREATE POLICY "Allow all SELECT on flashcards"
  ON flashcards FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all INSERT on flashcards"
  ON flashcards FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on flashcards"
  ON flashcards FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all DELETE on flashcards"
  ON flashcards FOR DELETE
  TO anon, authenticated
  USING (true);
