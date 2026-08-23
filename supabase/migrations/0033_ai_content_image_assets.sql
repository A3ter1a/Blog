begin;

do $$
begin
  if to_regprocedure('private.current_user_is_ai()') is null then
    raise exception '0033 requires private.current_user_is_ai()';
  end if;
end
$$;

-- AI accounts can create immutable public article assets only inside their own
-- namespaced folder. Normal uploads use upsert=false, so INSERT is sufficient;
-- no SELECT, UPDATE, or DELETE capability is granted by this policy.
drop policy if exists note_images_ai_insert on storage.objects;

create policy note_images_ai_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = 'ai-content'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.current_user_is_ai())
);

comment on policy note_images_ai_insert on storage.objects is
  'Active AI accounts may insert immutable note images only under ai-content/{auth.uid()}/...';

commit;
