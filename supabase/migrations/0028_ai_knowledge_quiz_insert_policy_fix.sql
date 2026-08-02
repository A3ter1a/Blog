-- AST-WP13 follow-up: 0027 creates a self_checked quiz when the AI self-check
-- passes, so the owner insert policy must admit both initial states. This is
-- safe to replay and also repairs databases where 0027 was already applied.
begin;

do $$
begin
  if to_regclass('public.ai_knowledge_quizzes') is null
    or to_regprocedure('private.current_user_is_ai()') is null
  then
    raise exception '0028 requires 0027 AI knowledge quiz tables and helpers';
  end if;
end
$$;

drop policy if exists ai_knowledge_quizzes_owner_insert on public.ai_knowledge_quizzes;
create policy ai_knowledge_quizzes_owner_insert
on public.ai_knowledge_quizzes for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked')
  and (select private.current_user_is_ai())
  and exists (
    select 1 from public.ai_content_proposals proposal
    where proposal.id = ai_knowledge_quizzes.proposal_id
      and proposal.owner_user_id = (select auth.uid())
      and proposal.ai_profile_id = (select auth.uid())
  )
);

drop policy if exists ai_knowledge_quizzes_owner_update on public.ai_knowledge_quizzes;
create policy ai_knowledge_quizzes_owner_update
on public.ai_knowledge_quizzes for update to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
)
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested', 'rejected')
  and (select private.current_user_is_ai())
);

drop policy if exists ai_knowledge_quiz_items_owner_insert on public.ai_knowledge_quiz_items;
create policy ai_knowledge_quiz_items_owner_insert
on public.ai_knowledge_quiz_items for insert to authenticated
with check (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));

drop policy if exists ai_knowledge_quiz_items_owner_update on public.ai_knowledge_quiz_items;
create policy ai_knowledge_quiz_items_owner_update
on public.ai_knowledge_quiz_items for update to authenticated
using (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
))
with check (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));

drop policy if exists ai_knowledge_quiz_items_owner_delete on public.ai_knowledge_quiz_items;
create policy ai_knowledge_quiz_items_owner_delete
on public.ai_knowledge_quiz_items for delete to authenticated
using (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));

commit;
