# Supabase migration and RLS guide

This directory is the canonical database setup for Asteroid.

For a brand-new empty project, run the files in order. **Do not replay `0001`–`0007` on the existing production project**; WP1-A proved that production has no migration history table even though those objects already exist.

1. `supabase/migrations/0001_base_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_problem_practice_marked.sql`
4. `supabase/migrations/0004_english_training.sql`
5. `supabase/migrations/0005_english_vocabulary_context.sql`
6. `supabase/migrations/0006_english_vocabulary_source_scope.sql`
7. `supabase/migrations/0007_document_ocr_storage.sql`
8. `supabase/migrations/0008_note_version_and_chapter_scope.sql`
9. `supabase/migrations/0009_planning_task_status.sql`
10. `supabase/migrations/0010_training_event_core.sql`
11. `supabase/migrations/0011_jobs_and_source_versions.sql`
12. `supabase/migrations/0012_private_note_default.sql`
13. `supabase/migrations/0013_boundary_policy_alignment.sql`
14. `supabase/migrations/0014_job_item_lease_rpc.sql`
15. `supabase/migrations/0015_content_migration_snapshots.sql`
16. `supabase/migrations/0016_english_training_core_backfill.sql`
17. `supabase/migrations/0017_english_training_command_rpc.sql`
18. `supabase/migrations/0018_english_subjective_grade_rpc.sql`
19. `supabase/migrations/0019_math_training_and_booklet_core.sql`
20. `supabase/verification.sql` as a read-only check after all migrations have finished

For the existing production project, `0008`–`0012` may only be run after the fixed-shadow rehearsal, production backup verification, and a separate user confirmation. `0013` additionally requires its own fixed-shadow behavior-matrix pass and a new confirmation. `0014` has only passed a local PostgreSQL concurrency rehearsal; it requires a new fixed-shadow transaction rehearsal and separate authorization before any remote write. `0015` has only passed a local immutable-snapshot/apply/rollback rehearsal; it also requires a new fixed-shadow transaction rehearsal and separate authorization. `0016` has passed a rollback/idempotency rehearsal against the local WP1-B production backup. `0017–0018` have passed authenticated RPC, transaction rollback, objective/subjective three-round, correction, idempotency, confirmation, and legacy-projection rehearsals in disposable PostgreSQL only. `0019` has passed a disposable PostgreSQL rollback/RLS/idempotency rehearsal with structure-only math fixtures; no real math paper was imported and it has not run on fixed shadow. None has run on production. Never treat the presence of these files as proof that a remote database has been migrated.

Do not run `supabase-init.sql` for production setup. It is kept only as a legacy pointer so older notes do not lead someone back to the previous all-open development policy.

## What the migrations cover

- `notes`: public visitors can read published notes; only authenticated admins can write.
- `chapters`: public visitors can read global chapters and chapters attached to published notes; only admins can write.
- `site_profile`: public visitors can read the pre-bootstrapped `main` row; runtime administrators may update that row but cannot create or delete profile rows.
- `admin_users`: runtime JWT access is read-only and limited to the administrator's own authority row. Initial insertion and authority recovery must use reviewed SQL in the Supabase dashboard.
- `problem_practice_statuses`: authenticated users can write/read only their own practice rows, including the `is_marked` collection flag; admins have audit-only read access.
- `math3_self_tests`: authenticated users can only access their own self-test rows.
- `english_papers`, `english_passages`, `english_questions`: English I past-paper source content; authenticated learners can read it, while only admins can create, update, or delete it.
- `english_attempts`, `english_attempt_answers`, `english_vocabulary`: authenticated users can only access their own English training rows; vocabulary rows can trace back to passage, question stem, or option sources.
- `planning_task_status`: manual three-state timeline status; task definitions remain in application code.
- `attempts`, `attempt_revisions`, `grades`: shared three-round lifecycle plus append-only answer and grade events. `0019` adds a typed `math_paper_id` reference without creating a parallel training-history table.
- `jobs`, `job_items`: persistent progress and bounded work ledger; these tables do not imply an always-running background worker. `0014` removes direct client inserts/updates to `job_items` and exposes owner-checked enqueue/claim/complete/fail/reset RPCs with database-time leases and attempt-count fencing.
- `source_documents`, `source_versions`: stable source identity and immutable source evidence for later OCR/RAG consumers.
- `content_migration_snapshots`: immutable before/after evidence for old-article Markdown repair. Admin-only RPCs verify `content_version`, source and target SHA-256 checksums in one transaction; AI-involved changes require `human_approved`, and rollback appends a new audit event instead of rewriting history.
- `0016` English backfill: maps every legacy English attempt to shared round 1, creates revision 1 for submitted answers, preserves the old total as `legacy_imported`, and appends a deterministic `system_scored` grade for objective sections. It never updates or deletes legacy English rows.
- `0017` English command RPC: atomically saves drafts, appends objective submissions/corrections and system grades, seals the previous round, and creates at most three rounds. A server-only `ENGLISH_TRAINING_CORE_MODE` switch controls `legacy`, `dual`, or `shared`; the default is `legacy`. `dual` keeps only the highest completed shared result as the old-table compatibility projection.
- `0018` English subjective grade RPCs: append an advisory `ai_suggested` grade beside the answer revision, require an explicit `user_final` event before the next round, and allow later final-score revisions without rewriting earlier suggestions or final grades.
- `0019` math/booklet core: adds admin-maintained fixed math papers and rubrics, append-only OCR confirmations, confirmation-bound AI/user grades with readable step deductions, and metadata-only booklets whose private note is the single body source. Re-confirmation invalidates old grades as current results without deleting them; the next round requires a `user_final` grade on the latest confirmation.
- `0020` problem OCR assets: extends the existing private `ocr-documents` bucket to accept compressed JPEG/PNG/WebP problem images while retaining PDF support. It changes no Storage object or policy and deletes no file.
- `note-images` Storage bucket: public image URLs remain readable because the bucket is public; object metadata reads for upsert plus uploads, overwrites, and deletes require admin access.
- `ocr-documents` Storage bucket: private staging for Baidu lecture PDFs and durable problem-OCR source images. Problem images use `problem-ocr/{user_id}/{batch_uuid}/{ordinal}.{ext}` and are removed only after every job item succeeds; failed work retains sources for explicit retry.

## Add the first admin

After the migration files have run, insert the same email used by Supabase Auth:

```sql
insert into public.admin_users (email)
values ('your_admin_email@example.com')
on conflict do nothing;
```

`admin_users` is the only runtime administrator authority for both Route Handlers and Supabase RLS. Route Handlers verify the bearer token, then query `admin_users` through that same user's JWT. `ADMIN_EMAILS` is not used for ordinary request authorization; it may only be retained for deployment self-check, first bootstrap, or emergency recovery documentation.

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

After running all migrations and inserting the admin email, run:

```text
supabase/verification.sql
```

This script only reads metadata and admin email matching state. It should report `pass` for required tables, RLS, policies, the `note-images` and `ocr-documents` buckets, and the admin email row. A `warn` on `admin_email_configured` means no admin email has been inserted yet.

## Local asset check

This command only scans repository files. It does not connect to Supabase and does not change production data:

```bash
npm run verify:rls-assets
npm run verify:wp2-snapshot-assets
npm run verify:wp2-snapshot-local
npm run verify:wp3-lease-assets
npm run verify:wp3-lease-local
npm run verify:wp3-worker-assets
npm run verify:wp3-problem-ocr-assets
npm run verify:wp3-problem-ocr-local
npm run plan:english-backfill
npm run verify:wp5-backfill-assets
npm run verify:wp5-backfill-local
npm run verify:wp6-core-assets
npm run verify:wp6-core-local
```

The `*-local` commands start disposable PostgreSQL clusters bound only to `127.0.0.1` and remove them after the rehearsal. They do not connect to fixed shadow or production.

## Production live audit

Before designing any new migration, run the repository's production audit as a separate read-only gate:

```text
supabase/live-audit.sql
```

The script inventories the live catalog, RLS, grants, exact public table counts, note visibility, JSONB problem references, English training references, admin/auth matching, and Storage object metadata. It intentionally does not return article bodies, submitted answers, object contents, password data, or API secrets.

Verify that the file still contains only read operations before using it:

```bash
npm run verify:live-audit
```

Execution and export instructions are stored in `fable info/evidence/wp1-a/README.md`. A passing local verification only proves that the audit asset is read-only; it does not prove that the production audit has been executed.
