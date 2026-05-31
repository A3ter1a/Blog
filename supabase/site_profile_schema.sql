-- Public site profile for the About page.
-- Run this in Supabase SQL Editor after production_rls_lockdown.sql has created public.is_admin().

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_profile (
  id text PRIMARY KEY DEFAULT 'main',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_profile_singleton CHECK (id = 'main')
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_site_profile_updated_at ON public.site_profile;
CREATE TRIGGER update_site_profile_updated_at
  BEFORE UPDATE ON public.site_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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

ALTER TABLE public.site_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_profile FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_site_profile" ON public.site_profile;
DROP POLICY IF EXISTS "admin_insert_site_profile" ON public.site_profile;
DROP POLICY IF EXISTS "admin_update_site_profile" ON public.site_profile;
DROP POLICY IF EXISTS "admin_delete_site_profile" ON public.site_profile;

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

COMMIT;
