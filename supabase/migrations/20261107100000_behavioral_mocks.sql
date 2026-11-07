-- Behavioral mocks: a fourth Interviews tab. One mock is a full behavioral round: one
-- question for each of the six areas, plus "Why this company?" if the owner wants it.
-- An Architect model writes the whole set in one call (each question with a rubric and a
-- target answer length) from the company, role and (optionally) the job description; the
-- owner answers each out loud against a timer; a Grader model grades the content, and code
-- takes off the Yap Penalty for running long.
--
--   mock_sessions   one mock: company (optional), role, pasted context (the PDF isn't kept)
--   mock_questions  its questions in order, each with its area, rubric and target time
--   mock_answers    each graded answer: the transcription, the timer's seconds, the
--                   model's content score, the penalty and the final score, and feedback
--   mock_settings   which model plays each role (Settings), one row
--
-- Rows are written by the server routes as the signed-in owner (RLS applies). Removing a
-- mock is a soft delete. Archivable like the other Interviews tabs; not offered in chat.

create table public.mock_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company text not null default '',  -- optional: '' when not given
  role text not null check (btrim(role) <> ''),
  include_fit boolean not null default true, -- the 7th question, "Why this company?"
  context text not null default '',
  pdf_name text,          -- the uploaded job description's file name; its contents aren't stored
  deleted_at timestamptz
);

create table public.mock_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references public.mock_sessions (id),
  position int not null check (position between 1 and 7),
  area text not null check (area in ('Conflict & Disagreement', 'Failure & Growth', 'Navigating Ambiguity', 'Leadership & Influence',
                                     'Ownership & Delivering Results', 'Collaboration & Teamwork', 'Motivation & Fit')),
  question text not null check (btrim(question) <> ''),
  rubric jsonb not null,  -- { requirements: [], strong_signals: [], red_flags: [] }
  target_time_seconds int not null check (target_time_seconds between 60 and 300),
  model text not null
);

create unique index mock_questions_order on public.mock_questions (session_id, position);

create table public.mock_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  question_id uuid not null references public.mock_questions (id),
  transcription text not null check (btrim(transcription) <> ''),
  duration_seconds int not null check (duration_seconds >= 0),
  target_time_seconds int not null,
  content_score int not null check (content_score between 0 and 10),
  yap_penalty int not null check (yap_penalty between 0 and 3),
  final_score int not null check (final_score between 0 and 10),
  feedback jsonb not null, -- { checks: [{ requirement, met, note }], worked, failed, tip }
  model text not null
);

create index mock_answers_question on public.mock_answers (question_id, created_at);

create table public.mock_settings (
  id int primary key default 1 check (id = 1),
  architect_model text not null default 'claude-sonnet-5-5' check (architect_model in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')),
  grader_model text not null default 'claude-haiku-5-5' check (grader_model in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')),
  updated_at timestamptz not null default now()
);
insert into public.mock_settings default values;

alter table public.mock_sessions enable row level security;
alter table public.mock_questions enable row level security;
alter table public.mock_answers enable row level security;
alter table public.mock_settings enable row level security;
grant select, insert, update on public.mock_sessions, public.mock_questions, public.mock_answers to authenticated;
grant select on public.mock_settings to authenticated;
grant update (architect_model, grader_model, updated_at) on public.mock_settings to authenticated;
create policy owner_all on public.mock_sessions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.mock_questions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.mock_answers for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_read on public.mock_settings for select to authenticated using ((select public.is_owner()));
create policy owner_update on public.mock_settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Behavioral can be archived like the other Interviews tabs -------------------------------

-- Full list: start from the latest definition when changing it (20261107010000_learning).
alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning', 'behavioral']);

-- Same keys as the column's check above; keep the two lists together.
create or replace function public.set_tab_archived(p_tab text, p_archived boolean, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.settings;
  v_row public.settings;
begin
  if p_tab is null or p_tab not in ('leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning', 'behavioral') then
    return jsonb_build_object('status', 'invalid', 'detail', 'That tab can''t be archived.');
  end if;

  select * into v_before from public.settings where id = 1 for update;

  update public.settings
  set archived_tabs = case
    when p_archived then array(select distinct t from unnest(archived_tabs || p_tab) as t order by t)
    else array_remove(archived_tabs, p_tab)
  end
  where id = 1
  returning * into v_row;

  if v_row.archived_tabs = v_before.archived_tabs then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_row), 'action_id', null);
  end if;

  -- Settings changes are logged (row_id null) but not picked up by Undo.
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'settings', null, jsonb_build_object('archived_tabs', v_before.archived_tabs),
          jsonb_build_object('archived_tabs', v_row.archived_tabs));

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', null);
end;
$$;
