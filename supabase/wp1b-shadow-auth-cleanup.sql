-- AST-WP1-B SHADOW ONLY.
-- Removes one placeholder Auth user created solely for a failed shadow restore.
-- The restore script calls this only when pg_restore rolled back and public.notes
-- is still absent, so it never targets production or a completed shadow restore.

delete from auth.users
where id = :'user_id'::uuid;
