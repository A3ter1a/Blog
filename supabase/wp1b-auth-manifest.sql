-- AST-WP1-B Auth identity manifest.
-- Read-only and intentionally excludes password hashes, tokens and identity metadata.

select coalesce(
  jsonb_agg(jsonb_build_object('id', id, 'email', email) order by id),
  '[]'::jsonb
)::text as payload
from auth.users;
