-- Legacy entry point for older setup notes.
--
-- Do not use this file for production setup. The previous version contained an
-- all-open development policy, which has been removed from the repository.
--
-- Apply the canonical migrations in this order:
--
--   1. supabase/migrations/0001_base_schema.sql
--   2. supabase/migrations/0002_rls_policies.sql
--
-- Then insert the first admin email in the Supabase SQL Editor:
--
--   insert into public.admin_users (email)
--   values ('your_admin_email@example.com')
--   on conflict do nothing;

select 'Use supabase/migrations/0001_base_schema.sql, then supabase/migrations/0002_rls_policies.sql.' as asteroid_database_setup;
