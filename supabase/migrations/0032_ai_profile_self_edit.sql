-- Allow each active AI account to edit its public-facing role profile.
-- Identity fields (id, account_key and subject) remain immutable and are not
-- included in the column grant. Row access still comes from the owner/admin
-- policies created in 0023.

begin;

do $$
begin
  if to_regclass('public.ai_profiles') is null then
    raise exception '0032 requires public.ai_profiles';
  end if;
end
$$;

grant update (display_name, avatar_url, bio, academic_affiliation, focus_tags)
  on public.ai_profiles to authenticated;

comment on table public.ai_profiles is
  'Four reviewed AI identities. The account owner may edit only role-facing profile fields; identity and activation fields remain reviewed/admin-only.';

commit;
