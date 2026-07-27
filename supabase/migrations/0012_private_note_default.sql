-- AST-WP1-E / G2': new notes default to private. Existing rows are not updated.

begin;

alter table public.notes
  alter column is_published set default false;

comment on column public.notes.is_published is
  'The only publication source of truth. Existing values are preserved; new rows default to private.';

commit;
