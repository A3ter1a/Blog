# Asteroid public deployment security checklist

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

3. Run `supabase/production_rls_lockdown.sql` in the Supabase SQL Editor.
4. Add the admin email to the `admin_users` table:

```sql
insert into public.admin_users (email)
values ('your_admin_email@example.com')
on conflict (email) do nothing;
```

## Expected behavior after deployment

- Public visitors can read published notes.
- Public visitors can read note images from the `note-images` bucket.
- Public visitors cannot create, edit, delete, import, review flashcards, or call AI APIs.
- Public visitors cannot upload, overwrite, or delete note images.
- `/debug` returns 404 outside development.
- AI API keys stay on the server in production.
- Client-provided AI keys are ignored in production.

## Important reminder

UI hiding is only convenience. Supabase RLS is the real database protection.
Do not deploy without applying the production RLS script.

The production script resets `storage.objects` policies for the current app's
`note-images` bucket. If you add more storage buckets later, add explicit
policies for those buckets too.
