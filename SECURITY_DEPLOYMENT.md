# Asteroid public deployment security checklist

For a step-by-step Chinese checklist, see `PRODUCTION_SECURITY_CHECKLIST.md`.

## Current production warning

If the public homepage still shows the `Create` navigation entry to a signed-out
visitor, the production deployment may still be running an old commit or stale
cache. Confirm the deployment commit in Vercel before treating the site as
secured.

## Required production setup

1. Create a Supabase Auth user for the site owner/admin.
2. Set these environment variables in the deployment platform:

```env
ADMIN_EMAILS=your_admin_email@example.com
DEEPSEEK_API_KEY=your_deepseek_api_key
QWEN_API_KEY=your_qwen_api_key
```

`ADMIN_EMAILS` protects server Route Handlers. Keep it server-side only.
The email list is not a password; Supabase Auth login and RLS remain required.

3. Apply the production database and RLS files in the Supabase SQL Editor:

```text
supabase/migrations/0001_base_schema.sql
supabase/migrations/0002_rls_policies.sql
supabase/migrations/0003_problem_practice_marked.sql
supabase/migrations/0004_english_training.sql
supabase/migrations/0005_english_vocabulary_context.sql
supabase/migrations/0006_english_vocabulary_source_scope.sql
supabase/migrations/0007_document_ocr_storage.sql
```

4. Add the admin email to the `admin_users` table:

```sql
insert into public.admin_users (email)
values ('your_admin_email@example.com')
on conflict do nothing;
```

5. Run the read-only database verification SQL:

```text
supabase/verification.sql
```

The verification SQL checks required tables, RLS state, policy names, the
`note-images` and `ocr-documents` buckets, and whether each `admin_users.email` matches a Supabase
Auth user email.

## Expected behavior after deployment

- Public visitors can read published notes.
- Public visitors can read note images from the `note-images` bucket.
- Public visitors cannot create, edit, delete, import, or call AI APIs.
- Public visitors cannot upload, overwrite, or delete note images.
- Public visitors cannot upload or list OCR staging PDFs from the private `ocr-documents` bucket.
- Storage policies do not directly `ALTER TABLE storage.objects`, because hosted
  Supabase projects own that internal table.
- `/debug` returns 404 outside development.
- AI API keys stay on the server in production.
- Client-provided AI keys are ignored in production.

## Important reminder

UI hiding is only convenience. Supabase RLS is the real database protection.
Do not deploy without applying the production RLS policies.

The Storage policies should allow public reads from the current app's
`note-images` bucket, keep `ocr-documents` private, and keep uploads/deletes
admin-only. If you add more storage buckets later, add explicit policies for
those buckets too.

## Repeatable verification

After the Vercel environment variables are set and the Supabase policies have
been applied, run:

```bash
npm run verify:rls-assets
```

This command scans local SQL assets only. It does not prove that production has
already run the migrations.

```bash
npm run verify:production-security
```

The command checks the live site by default:

```text
https://www.a3ter1a.cn
```

You can check another deployment URL with:

```bash
npm run verify:production-security -- --url https://your-preview-url.example
```

Expected critical results:

- `/debug` returns `404`.
- `/api/auth/admin` returns `401` when signed out.
- `/api/ai/config` returns `401` when signed out.
- AI `POST` endpoints return `401` when signed out:
  `/api/ai/config`, `/api/ai/analyze`, `/api/ai/ocr`,
  `/api/ai/note-qa`, `/api/ai/math3-classify`,
  `/api/ai/math3-self-test/generate`, and
  `/api/ai/math3-self-test/grade-step`.

The script also warns if the homepage HTML still contains an obvious create
entry. That warning is not a database security proof by itself, but it is a
strong sign that the production deployment or cache should be checked manually.
