-- EOD questions can ask anything: a question whose answer goes to "Its own log" (target
-- 'custom') saves the answer under the question itself, in public.eod_answers, instead of
-- a journal, notes or spending. Settings > End of day lists each one's past answers.
-- The question's wording is copied onto each answer, so rewording or removing a question
-- later doesn't change what was answered.

alter table public.eod_questions drop constraint eod_questions_target_check;
alter table public.eod_questions add constraint eod_questions_target_check
  check (target in ('journal', 'personal', 'content', 'talos', 'spending', 'custom'));

create table public.eod_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  question_id uuid references public.eod_questions (id) on delete set null,
  prompt text not null check (btrim(prompt) <> ''),
  body text not null check (btrim(body) <> ''),
  deleted_at timestamptz
);

create index eod_answers_question_idx on public.eod_answers (question_id, logical_date desc) where deleted_at is null;

alter table public.eod_answers enable row level security;
grant select, insert, update on public.eod_answers to authenticated;
create policy owner_all on public.eod_answers for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Undo works on these like every other EOD entry. Full list: start from the latest
-- definition when changing it (20261107140000_life_experiences).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases', 'spending', 'life_experiences', 'eod_answers'])
$$;

-- ---- save_eod, now with own-log answers --------------------------------------------------

-- Production drifted back to the original 4-argument save_eod (20261106230000_eod) even
-- though 20261107020000_eod_reminders is recorded as applied, so drop whichever exists.
-- Leaving the old one beside the new one would make named-argument calls ambiguous.
drop function if exists public.save_eod(date, jsonb, jsonb, uuid[], text);
drop function if exists public.save_eod(date, jsonb, jsonb, text);

-- p_answers: [{ "question_id": uuid | null, "prompt": text, "body": text }]
create function public.save_eod(
  p_date date, p_notes jsonb, p_spending jsonb, p_done uuid[] default '{}', p_answers jsonb default '[]',
  p_tool text default 'eod'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_note public.notes;
  v_spend public.spending;
  v_answer public.eod_answers;
  v_before public.reminders;
  v_rem public.reminders;
  v_action uuid;
  v_saved jsonb := '[]';
  v_id uuid;
  e jsonb;
begin
  if jsonb_typeof(coalesce(p_notes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_spending, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_answers, '[]')) <> 'array' then
    raise exception 'p_notes, p_spending and p_answers must be json arrays';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_notes, '[]')) loop
    if e->>'kind' not in ('journal', 'personal', 'content', 'talos') or btrim(coalesce(e->>'body', '')) = '' then
      raise exception 'bad EOD note: %', e;
    end if;
    insert into public.notes (kind, logical_date, body) values (e->>'kind', p_date, e->>'body') returning * into v_note;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'notes', v_note.id, null, to_jsonb(v_note)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'notes', 'row', to_jsonb(v_note), 'action_id', v_action);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_answers, '[]')) loop
    if btrim(coalesce(e->>'prompt', '')) = '' or btrim(coalesce(e->>'body', '')) = '' then
      raise exception 'bad EOD answer: %', e;
    end if;
    insert into public.eod_answers (logical_date, question_id, prompt, body)
    values (p_date, nullif(e->>'question_id', '')::uuid, btrim(e->>'prompt'), e->>'body')
    returning * into v_answer;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'eod_answers', v_answer.id, null, to_jsonb(v_answer)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'eod_answers', 'row', to_jsonb(v_answer), 'action_id', v_action);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_spending, '[]')) loop
    if (e->>'amount')::numeric is null or (e->>'amount')::numeric <= 0 or btrim(coalesce(e->>'what', '')) = '' then
      raise exception 'bad EOD spending: %', e;
    end if;
    insert into public.spending (logical_date, amount, what, category)
    values (p_date, round((e->>'amount')::numeric, 2), btrim(e->>'what'), coalesce(e->>'category', 'Other'))
    returning * into v_spend;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'spending', v_spend.id, null, to_jsonb(v_spend)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'spending', 'row', to_jsonb(v_spend), 'action_id', v_action);
  end loop;

  foreach v_id in array coalesce(p_done, '{}') loop
    select * into v_before from public.reminders where id = v_id and deleted_at is null and done_at is null for update;
    continue when not found;
    update public.reminders set done_at = now() where id = v_id returning * into v_rem;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'reminders', v_id, to_jsonb(v_before), to_jsonb(v_rem)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'reminders', 'row', to_jsonb(v_rem), 'action_id', v_action);
  end loop;

  if jsonb_array_length(v_saved) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;
  return jsonb_build_object('status', 'saved', 'saved', v_saved);
end;
$$;

revoke execute on function public.save_eod(date, jsonb, jsonb, uuid[], jsonb, text) from public, anon;
grant execute on function public.save_eod(date, jsonb, jsonb, uuid[], jsonb, text) to authenticated;
