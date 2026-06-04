-- =============================================
-- 数学三自测试卷表
-- =============================================
-- 用法：在 Supabase SQL Editor 执行一次。
-- 说明：本表保存 AI 生成试卷、考试作答、分步评分和复盘状态。

CREATE TABLE IF NOT EXISTS public.math3_self_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '数学三自测试卷',
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'full')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('comfort', 'simulation', 'challenge')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'submitted', 'reviewed')),
  paper JSONB NOT NULL,
  attempt JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_math3_self_tests_updated_at
  ON public.math3_self_tests(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_math3_self_tests_user_updated_at
  ON public.math3_self_tests(user_id, updated_at DESC);

ALTER TABLE public.math3_self_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "math3_self_tests_admin_select" ON public.math3_self_tests;
DROP POLICY IF EXISTS "math3_self_tests_admin_insert" ON public.math3_self_tests;
DROP POLICY IF EXISTS "math3_self_tests_admin_update" ON public.math3_self_tests;
DROP POLICY IF EXISTS "math3_self_tests_admin_delete" ON public.math3_self_tests;

CREATE POLICY "math3_self_tests_admin_select"
  ON public.math3_self_tests
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "math3_self_tests_admin_insert"
  ON public.math3_self_tests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "math3_self_tests_admin_update"
  ON public.math3_self_tests
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "math3_self_tests_admin_delete"
  ON public.math3_self_tests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_math3_self_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_math3_self_tests_updated_at ON public.math3_self_tests;

CREATE TRIGGER update_math3_self_tests_updated_at
  BEFORE UPDATE ON public.math3_self_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_math3_self_tests_updated_at();

-- =============================================
-- 完成
-- =============================================
