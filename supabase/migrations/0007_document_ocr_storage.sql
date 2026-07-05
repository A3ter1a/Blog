-- Temporary private PDF storage for Baidu Unlimited OCR document parsing.
-- Run after 0002_rls_policies.sql so private.current_user_is_admin() exists.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocr-documents',
  'ocr-documents',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ocr_documents_admin_select on storage.objects;
drop policy if exists ocr_documents_admin_insert on storage.objects;
drop policy if exists ocr_documents_admin_update on storage.objects;
drop policy if exists ocr_documents_admin_delete on storage.objects;

create policy ocr_documents_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ocr-documents'
  and (select private.current_user_is_admin())
);

create policy ocr_documents_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ocr-documents'
  and (select private.current_user_is_admin())
);

create policy ocr_documents_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ocr-documents'
  and (select private.current_user_is_admin())
)
with check (
  bucket_id = 'ocr-documents'
  and (select private.current_user_is_admin())
);

create policy ocr_documents_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ocr-documents'
  and (select private.current_user_is_admin())
);

commit;
