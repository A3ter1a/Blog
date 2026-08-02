-- AST-WP11: keep AI-owned collections private until an administrator publishes them.
-- Existing published collections are not modified by this additive migration.

begin;

-- The base migration granted these tables only to authenticated clients. Public
-- collection cards/detail pages also need the RLS-filtered read grant.
grant select on public.note_collections, public.note_collection_items to anon;

drop policy if exists note_collections_owner_update on public.note_collections;
create policy note_collections_owner_update
on public.note_collections for update to authenticated
using (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and not is_published
  and (select private.current_user_is_ai())
)
with check (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and not is_published
  and (select private.current_user_is_ai())
);

drop policy if exists note_collections_owner_delete on public.note_collections;
create policy note_collections_owner_delete
on public.note_collections for delete to authenticated
using (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and not is_published
  and (select private.current_user_is_ai())
);

drop policy if exists note_collection_items_owner_insert on public.note_collection_items;
create policy note_collection_items_owner_insert
on public.note_collection_items for insert to authenticated
with check (exists (
  select 1
  from public.note_collections collection
  join public.notes note on note.id = note_collection_items.note_id
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and collection.ai_profile_id = (select auth.uid())
    and not collection.is_published
    and note.author_kind = 'ai'
    and note.owner_user_id = (select auth.uid())
    and note.author_profile_id = (select auth.uid())
    and note_collection_items.added_by_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));

drop policy if exists note_collection_items_owner_update on public.note_collection_items;
create policy note_collection_items_owner_update
on public.note_collection_items for update to authenticated
using (exists (
  select 1 from public.note_collections collection
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and not collection.is_published
    and (select private.current_user_is_ai())
))
with check (exists (
  select 1
  from public.note_collections collection
  join public.notes note on note.id = note_collection_items.note_id
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and not collection.is_published
    and note.author_kind = 'ai'
    and note.owner_user_id = (select auth.uid())
    and note_collection_items.added_by_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));

drop policy if exists note_collection_items_owner_delete on public.note_collection_items;
create policy note_collection_items_owner_delete
on public.note_collection_items for delete to authenticated
using (exists (
  select 1 from public.note_collections collection
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and not collection.is_published
    and (select private.current_user_is_ai())
));

comment on policy note_collections_owner_update on public.note_collections is
  'AI accounts may edit only their own unpublished collections; administrators publish.';

commit;
