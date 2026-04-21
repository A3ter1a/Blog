-- =============================================
-- 考研笔记数据库初始化脚本
-- =============================================

-- 1. 创建枚举类型
CREATE TYPE note_type AS ENUM ('note', 'problem', 'essay');
CREATE TYPE subject AS ENUM ('math', 'english', 'politics', 'economics');
CREATE TYPE problem_type AS ENUM ('choice', 'fill', 'calculation', 'proof', 'proofEssay');
CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE video_platform AS ENUM ('bilibili', 'youtube');

-- 2. 创建 notes 表
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type note_type NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  subject subject,
  tags TEXT[] DEFAULT '{}',
  cover_image TEXT,
  videos JSONB DEFAULT '[]',
  problems JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_is_published ON notes(is_published);

-- 4. 创建 RLS 策略（行级安全）
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取已发布的笔记
CREATE POLICY "公开笔记可读" ON notes
  FOR SELECT
  USING (is_published = true);

-- 允许所有操作（开发阶段，生产环境应该限制为用户自己的笔记）
CREATE POLICY "允许所有操作" ON notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 初始化完成
-- =============================================
