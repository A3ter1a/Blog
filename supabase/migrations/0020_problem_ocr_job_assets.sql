-- AST-WP3-D: allow private compressed problem images in the existing OCR temp bucket.
-- Existing PDFs and policies remain unchanged; running assets are cleaned only after terminal processing.

begin;

update storage.buckets
set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
where id = 'ocr-documents'
  and name = 'ocr-documents';

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'ocr-documents'
      and name = 'ocr-documents'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ocr-documents bucket must exist before applying 0020';
  end if;
end;
$$;

commit;
