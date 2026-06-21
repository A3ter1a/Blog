# Supabase migration and RLS guide

This directory is the canonical database setup for Asteroid.

Run the files in order in the Supabase SQL Editor:

1. `supabase/migrations/0001_base_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/verification.sql` as a read-only check after both migrations have finished

Do not run `supabase-init.sql` for production setup. It is kept only as a legacy pointer so older notes do not lead someone back to the previous all-open development policy.

## What the migrations cover

- `notes`: public visitors can read published notes; only authenticated admins can write.
- `chapters`: public visitors can read global chapters and chapters attached to published notes; only admins can write.
- `site_profile`: public visitors can read profile data; only admins can write.
- `admin_users`: direct table access is limited to existing admins. Initial admin insertion must be done from the Supabase dashboard SQL Editor.
- `problem_practice_statuses`: authenticated users can only access their own practice rows.
- `math3_self_tests`: authenticated users can only access their own self-test rows.
- `note-images` Storage bucket: public image URLs remain readable because the bucket is public; object metadata reads for upsert plus uploads, overwrites, and deletes require admin access.

## Add the first admin

After both migration files have run, insert the same email used by Supabase Auth:

```sql
insert into public.admin_users (email)
values ('your_admin_email@example.com')
on conflict do nothing;
```

The app also checks `ADMIN_EMAILS` in the deployment platform. Keep both in sync:

- `ADMIN_EMAILS` protects Next.js Route Handlers.
- `admin_users` protects Supabase tables and Storage through RLS.

To check whether the inserted email matches a real Supabase Auth user, run:

```sql
select
  au.email as inserted_admin_email,
  u.id as matched_auth_user_id,
  u.email as matched_auth_email,
  u.created_at as auth_user_created_at
from public.admin_users au
left join auth.users u
  on lower(u.email) = lower(au.email)
order by au.created_at desc;
```

If `matched_auth_user_id` is empty, the email in `admin_users` does not match the Supabase Auth login email.

## Post-migration verification

After running both migrations and inserting the admin email, run:

```text
supabase/verification.sql
```

This script only reads metadata and admin email matching state. It should report `pass` for required tables, RLS, policies, the `note-images` bucket, and the admin email row. A `warn` on `admin_email_configured` means no admin email has been inserted yet.

## Local asset check

This command only scans repository files. It does not connect to Supabase and does not change production data:

```bash
npm run verify:rls-assets
```
