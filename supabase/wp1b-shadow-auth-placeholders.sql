-- AST-WP1-B SHADOW ONLY.
-- Creates a same-ID Auth placeholder with a random shadow-only password so restored
-- owner FKs and RLS can be exercised without copying production password hashes.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  is_sso_user,
  is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  :'user_id'::uuid,
  'authenticated',
  'authenticated',
  :'user_email',
  extensions.crypt(:'shadow_password', extensions.gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '',
  '',
  '',
  '',
  false,
  false
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  :'user_email',
  :'user_id'::uuid,
  jsonb_build_object(
    'sub', :'user_id',
    'email', :'user_email',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
)
on conflict do nothing;
