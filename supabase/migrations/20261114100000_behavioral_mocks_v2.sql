-- Behavioral mocks v2: Claude (voice mode) asks and grades; Talos ties the mock to an
-- application, times each answer with a stopwatch stored here, and keeps the numbers.
-- No model is called anywhere in this feature.
--
--   bm_sessions          one mock: role, company, a copy of the job description, the pasted
--                        question list and the pasted AI feedback, both verbatim
--   bm_questions         its 1 to 10 questions in order: area, question, rubric, target,
--                        the stopwatch (timer_started_at while running, actual_seconds after),
--                        retries, the typed content score and the owner's own note
--   bm_question_scores   the Yap Penalty and final score, computed, never stored
--
-- The first version's mock_* tables are left as they are; nothing is converted or deleted.
--
-- Same conventions as the rest of the app: security invoker (owner-only RLS applies), soft
-- delete only (no DELETE grant), and every write logs an actions row so Undo works, except
-- the three stopwatch functions (start_bm_timer, stop_bm_timer, retry_bm_question): undoing
-- a running timer is confusing, so the owner edits the time field instead. Writes return
-- jsonb { status, row, action_id } | { status: 'not_found' } | { status: 'invalid', detail }.
-- Not offered in chat: no chat tool reads or writes these tables.

-- ---- Applications keep a job description ---------------------------------------------------

alter table public.applications add column job_description text;

-- Sets (or clears, with '' or blank) an application's saved job description, verbatim.
create function public.set_application_job_description(p_id uuid, p_text text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.applications;
  v_row public.applications;
  v_text text := case when p_text is null or btrim(p_text) = '' then null else p_text end;
  v_action uuid;
begin
  select * into v_before from public.applications where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_text is not distinct from v_before.job_description then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.applications set job_description = v_text where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'applications', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- The three prompts, editable in Settings ---------------------------------------------------
-- Null means "use the default", whose text lives once, in code (lib/bm/prompts.ts).

alter table public.settings
  add column bm_prompt_questions text,
  add column bm_prompt_interviewer text,
  add column bm_prompt_grader text;

-- p_which: 'questions' | 'interviewer' | 'grader'. Null or blank text resets it to the default.
-- Logged like the other settings writes (row_id null), not picked up by Undo.
create function public.set_bm_prompt(p_which text, p_text text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.settings;
  v_row public.settings;
  v_text text := case when p_text is null or btrim(p_text) = '' then null else p_text end;
  v_col text;
begin
  if p_which is null or p_which not in ('questions', 'interviewer', 'grader') then
    return jsonb_build_object('status', 'invalid', 'detail', 'Unknown prompt.');
  end if;
  v_col := 'bm_prompt_' || p_which;

  select * into v_before from public.settings where id = 1 for update;

  update public.settings set
    bm_prompt_questions = case when p_which = 'questions' then v_text else bm_prompt_questions end,
    bm_prompt_interviewer = case when p_which = 'interviewer' then v_text else bm_prompt_interviewer end,
    bm_prompt_grader = case when p_which = 'grader' then v_text else bm_prompt_grader end
  where id = 1
  returning * into v_row;

  if to_jsonb(v_row)->v_col is not distinct from to_jsonb(v_before)->v_col then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_row), 'action_id', null);
  end if;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'settings', null, jsonb_build_object(v_col, to_jsonb(v_before)->v_col), jsonb_build_object(v_col, to_jsonb(v_row)->v_col));

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', null);
end;
$$;

-- ---- Tables ---------------------------------------------------------------------------------------

create table public.bm_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id),  -- optional
  role text not null check (btrim(role) <> ''),
  company text,
  job_description text,   -- copied at start, editable
  started_on date not null, -- logical day (4am rule)
  questions_raw text,     -- the pasted question list, verbatim
  feedback_text text,     -- the pasted AI feedback, verbatim
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index bm_sessions_newest on public.bm_sessions (started_on desc, created_at desc) where deleted_at is null;

create table public.bm_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.bm_sessions (id),
  position int not null check (position between 1 and 10),
  area text not null check (area in ('conflict', 'failure', 'ambiguity', 'leadership', 'ownership', 'teamwork', 'why_company', 'other')),
  question_text text not null check (btrim(question_text) <> ''),
  rubric_text text,
  target_seconds int not null check (target_seconds between 10 and 900),
  actual_seconds int check (actual_seconds >= 0),  -- the final attempt's time; null: no time recorded
  timer_started_at timestamptz,                    -- set while its stopwatch runs
  retries int not null default 0 check (retries >= 0),
  content_score numeric(3, 1) check (content_score between 0 and 10 and content_score * 2 = round(content_score * 2)),
  note text,                                       -- the owner's own words
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index bm_questions_pos on public.bm_questions (session_id, position) where deleted_at is null;
-- One stopwatch at a time in a mock.
create unique index bm_questions_one_running on public.bm_questions (session_id) where timer_started_at is not null and deleted_at is null;

alter table public.bm_sessions enable row level security;
alter table public.bm_questions enable row level security;
grant select, insert, update on public.bm_sessions, public.bm_questions to authenticated;
create policy owner_all on public.bm_sessions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.bm_questions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Scores: computed, never stored ----------------------------------------------------------------
-- Yap Penalty: 1 point per full 15 seconds over the target, at most 3; none under it, and
-- none when no time was recorded (missing is not zero). Final: content less penalty, never
-- below 0; blank with no content score. Live questions of live mocks only.

create view public.bm_question_scores with (security_invoker = true) as
select q.id, q.session_id, q.position, q.area, q.target_seconds, q.actual_seconds,
       q.retries, q.content_score,
       case when q.actual_seconds is null then null
            else least(3, floor(greatest(q.actual_seconds - q.target_seconds, 0) / 15.0))::int
       end as yap_penalty,
       case when q.content_score is null then null
            else greatest(0, q.content_score - coalesce(
                   case when q.actual_seconds is null then 0
                        else least(3, floor(greatest(q.actual_seconds - q.target_seconds, 0) / 15.0))
                   end, 0))
       end as final_score
  from public.bm_questions q
  join public.bm_sessions s on s.id = q.session_id
 where q.deleted_at is null and s.deleted_at is null;

grant select on public.bm_question_scores to authenticated;

-- A mock's overall score: the average final score over questions that have one, to one
-- decimal. Null ("no data") with none.
create function public.bm_session_overall(p_session uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(avg(final_score), 1) from public.bm_question_scores
   where session_id = p_session and final_score is not null
$$;

-- Every live mock, newest first, with its overall score: the history list, the line of
-- recent scores and the hub card.
create function public.bm_sessions_overview()
returns table (id uuid, started_on date, created_at timestamptz, company text, role text, application_id uuid,
               questions int, overall numeric)
language sql
stable
set search_path = ''
as $$
  select s.id, s.started_on, s.created_at, s.company, s.role, s.application_id,
         (select count(*) from public.bm_questions q where q.session_id = s.id and q.deleted_at is null)::int,
         (select round(avg(v.final_score), 1) from public.bm_question_scores v where v.session_id = s.id and v.final_score is not null)
    from public.bm_sessions s
   where s.deleted_at is null
   order by s.started_on desc, s.created_at desc
$$;

-- Per area, over live mocks. Each average uses only the questions that have that value
-- (avg ignores nulls), so a question with no time or no score never counts as zero.
create function public.bm_trends_by_area()
returns table (area text, scored int, avg_content numeric, avg_final numeric,
               avg_time_ratio numeric, over_target int, timed int, avg_retries numeric)
language sql
stable
set search_path = ''
as $$
  select v.area,
         (count(*) filter (where v.content_score is not null))::int,
         round(avg(v.content_score), 1),
         round(avg(v.final_score), 1),
         round(avg(v.actual_seconds::numeric / v.target_seconds), 2),
         (count(*) filter (where v.actual_seconds > v.target_seconds))::int,
         (count(*) filter (where v.actual_seconds is not null))::int,
         round(avg(v.retries), 1)
    from public.bm_question_scores v
   group by v.area
   order by array_position(array['conflict', 'failure', 'ambiguity', 'leadership', 'ownership', 'teamwork', 'why_company', 'other'], v.area)
$$;

-- Across all live mocks: the share over target (over_target / timed), time as a fraction of
-- target (averaged over questions with a recorded time), and retries per mock (mocks with at
-- least one question).
create function public.bm_trends_overall()
returns table (mocks int, timed int, over_target int, avg_time_ratio numeric, avg_retries_per_mock numeric)
language sql
stable
set search_path = ''
as $$
  with per_mock as (
    select v.session_id, sum(v.retries) as retries from public.bm_question_scores v group by v.session_id
  )
  select (select count(*) from per_mock)::int,
         (select count(*) from public.bm_question_scores v where v.actual_seconds is not null)::int,
         (select count(*) from public.bm_question_scores v where v.actual_seconds > v.target_seconds)::int,
         (select round(avg(v.actual_seconds::numeric / v.target_seconds), 2) from public.bm_question_scores v),
         (select round(avg(p.retries), 1) from per_mock p)
$$;

-- ---- Writes ------------------------------------------------------------------------------------------

-- A JSON number that is within [p_lo, p_hi] and a whole multiple of p_step, or null when it
-- isn't (or isn't a number). Used to refuse bad values with a message rather than a raw error.
create function public.bm_json_number(p jsonb, p_lo numeric, p_hi numeric, p_step numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then
    return null;
  end if;
  v := (p #>> '{}')::numeric;
  if v < p_lo or v > p_hi or mod(v, p_step) <> 0 then
    return null;
  end if;
  return v;
end;
$$;

-- A new mock, from an application (p_application_id) or from the tab (null). With
-- p_save_to_application and a job description, it's also saved on the application (its own
-- actions row; that action's id comes back as application_action_id).
create function public.start_bm_session(
  p_application_id uuid, p_role text, p_company text, p_job_description text,
  p_save_to_application boolean default false, p_started_on date default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_jd text := case when p_job_description is null or btrim(p_job_description) = '' then null else p_job_description end;
  v_app jsonb;
  v_row public.bm_sessions;
  v_action uuid;
begin
  if p_role is null or btrim(p_role) = '' then
    return jsonb_build_object('status', 'invalid', 'detail', 'Role is required.');
  end if;
  if p_application_id is not null then
    if not exists (select 1 from public.applications where id = p_application_id and deleted_at is null) then
      return jsonb_build_object('status', 'not_found');
    end if;
    if coalesce(p_save_to_application, false) and v_jd is not null then
      v_app := public.set_application_job_description(p_application_id, v_jd, p_tool);
    end if;
  end if;

  insert into public.bm_sessions (application_id, role, company, job_description, started_on)
  values (p_application_id, btrim(p_role), nullif(btrim(coalesce(p_company, '')), ''), v_jd, coalesce(p_started_on, public.owner_today()))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_sessions', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action,
                            'application_action_id', v_app->'action_id');
end;
$$;

-- Saves a mock's questions, once: p_questions is an array of 1 to 10
-- { area, question_text, rubric_text, target_seconds }, in order. Everything is checked
-- before anything is written. Each question gets its own actions row; action_id is the
-- session's (questions_raw saved verbatim).
create function public.save_bm_questions(p_session uuid, p_questions jsonb, p_questions_raw text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.bm_sessions;
  v_row public.bm_sessions;
  v_q public.bm_questions;
  v_e jsonb;
  v_i int;
  v_n int;
  v_qs jsonb := '[]'::jsonb;
  v_action uuid;
begin
  select * into v_before from public.bm_sessions where id = p_session and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.bm_questions where session_id = p_session and deleted_at is null) then
    return jsonb_build_object('status', 'invalid', 'detail', 'This mock already has its questions.');
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    return jsonb_build_object('status', 'invalid', 'detail', 'A mock has 1 to 10 questions.');
  end if;
  v_n := jsonb_array_length(p_questions);
  if v_n < 1 or v_n > 10 then
    return jsonb_build_object('status', 'invalid', 'detail', 'A mock has 1 to 10 questions.');
  end if;

  for v_e, v_i in select e, i from jsonb_array_elements(p_questions) with ordinality as t(e, i) order by i loop
    if jsonb_typeof(v_e) <> 'object' then
      return jsonb_build_object('status', 'invalid', 'detail', format('Question %s is empty.', v_i));
    end if;
    if coalesce(v_e->>'area', '') not in ('conflict', 'failure', 'ambiguity', 'leadership', 'ownership', 'teamwork', 'why_company', 'other') then
      return jsonb_build_object('status', 'invalid', 'detail', format('Question %s needs an area.', v_i));
    end if;
    if btrim(coalesce(v_e->>'question_text', '')) = '' then
      return jsonb_build_object('status', 'invalid', 'detail', format('Question %s needs its question.', v_i));
    end if;
    if public.bm_json_number(v_e->'target_seconds', 10, 900, 1) is null then
      return jsonb_build_object('status', 'invalid', 'detail', format('Question %s needs a target from 10 to 900 seconds.', v_i));
    end if;
  end loop;

  for v_e, v_i in select e, i from jsonb_array_elements(p_questions) with ordinality as t(e, i) order by i loop
    insert into public.bm_questions (session_id, position, area, question_text, rubric_text, target_seconds)
    values (p_session, v_i, v_e->>'area', btrim(v_e->>'question_text'),
            case when btrim(coalesce(v_e->>'rubric_text', '')) = '' then null else v_e->>'rubric_text' end,
            public.bm_json_number(v_e->'target_seconds', 10, 900, 1)::int)
    returning * into v_q;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'bm_questions', v_q.id, null, to_jsonb(v_q));
    v_qs := v_qs || jsonb_build_array(to_jsonb(v_q));
  end loop;

  update public.bm_sessions set questions_raw = p_questions_raw, updated_at = now()
  where id = p_session returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_sessions', p_session, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'questions', v_qs, 'action_id', v_action);
end;
$$;

-- Edits a mock. Keys left out of p_changes stay as they are. Allowed: role (required),
-- company, job_description, feedback_text ('' or null clears; text is kept verbatim).
create function public.update_bm_session(p_id uuid, p_changes jsonb, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.bm_sessions;
  v_new public.bm_sessions;
  v_row public.bm_sessions;
  v_key text;
  v_action uuid;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    return jsonb_build_object('status', 'invalid', 'detail', 'Nothing to change.');
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('role', 'company', 'job_description', 'feedback_text') then
      return jsonb_build_object('status', 'invalid', 'detail', format('%s can''t be changed.', v_key));
    end if;
  end loop;
  if p_changes ? 'role' and btrim(coalesce(p_changes->>'role', '')) = '' then
    return jsonb_build_object('status', 'invalid', 'detail', 'Role is required.');
  end if;

  select * into v_before from public.bm_sessions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_new := v_before;
  if p_changes ? 'role' then v_new.role := btrim(p_changes->>'role'); end if;
  if p_changes ? 'company' then v_new.company := nullif(btrim(coalesce(p_changes->>'company', '')), ''); end if;
  if p_changes ? 'job_description' then v_new.job_description := nullif(p_changes->>'job_description', ''); end if;
  if p_changes ? 'feedback_text' then v_new.feedback_text := nullif(p_changes->>'feedback_text', ''); end if;

  if (v_new.role, v_new.company, v_new.job_description, v_new.feedback_text)
     is not distinct from (v_before.role, v_before.company, v_before.job_description, v_before.feedback_text) then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.bm_sessions
  set role = v_new.role, company = v_new.company, job_description = v_new.job_description,
      feedback_text = v_new.feedback_text, updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_sessions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Edits one question. Keys left out stay as they are. Allowed: area, question_text,
-- rubric_text, target_seconds (10-900), actual_seconds (whole seconds >= 0, or null: no
-- time recorded), retries (whole, >= 0), content_score (0-10 in half steps, or null), note.
create function public.update_bm_question(p_id uuid, p_changes jsonb, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.bm_questions;
  v_new public.bm_questions;
  v_row public.bm_questions;
  v_key text;
  v_action uuid;
  v_null boolean;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    return jsonb_build_object('status', 'invalid', 'detail', 'Nothing to change.');
  end if;

  select q.* into v_before from public.bm_questions q
  join public.bm_sessions s on s.id = q.session_id and s.deleted_at is null
  where q.id = p_id and q.deleted_at is null
  for update of q;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_new := v_before;

  for v_key in select jsonb_object_keys(p_changes) loop
    v_null := jsonb_typeof(p_changes->v_key) = 'null';
    case v_key
      when 'area' then
        if coalesce(p_changes->>'area', '') not in ('conflict', 'failure', 'ambiguity', 'leadership', 'ownership', 'teamwork', 'why_company', 'other') then
          return jsonb_build_object('status', 'invalid', 'detail', 'Unknown area.');
        end if;
        v_new.area := p_changes->>'area';
      when 'question_text' then
        if btrim(coalesce(p_changes->>'question_text', '')) = '' then
          return jsonb_build_object('status', 'invalid', 'detail', 'The question can''t be empty.');
        end if;
        v_new.question_text := btrim(p_changes->>'question_text');
      when 'rubric_text' then
        v_new.rubric_text := case when btrim(coalesce(p_changes->>'rubric_text', '')) = '' then null else p_changes->>'rubric_text' end;
      when 'note' then
        v_new.note := case when btrim(coalesce(p_changes->>'note', '')) = '' then null else p_changes->>'note' end;
      when 'target_seconds' then
        if public.bm_json_number(p_changes->'target_seconds', 10, 900, 1) is null then
          return jsonb_build_object('status', 'invalid', 'detail', 'The target must be 10 to 900 seconds.');
        end if;
        v_new.target_seconds := (p_changes->>'target_seconds')::numeric::int;
      when 'actual_seconds' then
        if v_null then
          v_new.actual_seconds := null;
        elsif public.bm_json_number(p_changes->'actual_seconds', 0, 86400, 1) is null then
          return jsonb_build_object('status', 'invalid', 'detail', 'The time must be whole seconds, 0 or more.');
        else
          v_new.actual_seconds := (p_changes->>'actual_seconds')::numeric::int;
        end if;
      when 'retries' then
        if public.bm_json_number(p_changes->'retries', 0, 1000, 1) is null then
          return jsonb_build_object('status', 'invalid', 'detail', 'Retries must be a whole number, 0 or more.');
        end if;
        v_new.retries := (p_changes->>'retries')::numeric::int;
      when 'content_score' then
        if v_null then
          v_new.content_score := null;
        elsif public.bm_json_number(p_changes->'content_score', 0, 10, 0.5) is null then
          return jsonb_build_object('status', 'invalid', 'detail', 'A content score is 0 to 10 in half steps.');
        else
          v_new.content_score := (p_changes->>'content_score')::numeric;
        end if;
      else
        return jsonb_build_object('status', 'invalid', 'detail', format('%s can''t be changed.', v_key));
    end case;
  end loop;

  if (v_new.area, v_new.question_text, v_new.rubric_text, v_new.note, v_new.target_seconds, v_new.actual_seconds,
      v_new.retries, v_new.content_score)
     is not distinct from (v_before.area, v_before.question_text, v_before.rubric_text, v_before.note, v_before.target_seconds,
      v_before.actual_seconds, v_before.retries, v_before.content_score) then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.bm_questions
  set area = v_new.area, question_text = v_new.question_text, rubric_text = v_new.rubric_text, note = v_new.note,
      target_seconds = v_new.target_seconds, actual_seconds = v_new.actual_seconds, retries = v_new.retries,
      content_score = v_new.content_score, updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_questions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft deletes: Undo brings them back. A deleted mock drops out of history and trends; its
-- questions stay as they are (the view and functions skip a deleted mock's questions).
create function public.delete_bm_session(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.bm_sessions;
  v_row public.bm_sessions;
  v_action uuid;
begin
  select * into v_before from public.bm_sessions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.bm_sessions set deleted_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_sessions', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_bm_question(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.bm_questions;
  v_row public.bm_questions;
  v_action uuid;
begin
  select * into v_before from public.bm_questions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- A deleted question's stopwatch stops without saving a time.
  update public.bm_questions set deleted_at = now(), timer_started_at = null where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'bm_questions', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- The stopwatch: no actions rows, no Undo --------------------------------------------------------
-- The start time is the database clock, so a stopwatch started on one device can be stopped
-- on another. Each returns the database's now as well, so a device can correct its clock.

-- Starts a question's stopwatch. Any other running stopwatch in the same mock is stopped
-- first and its time saved (returned as `stopped`). Already running: 'running', unchanged.
create function public.start_bm_timer(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_session uuid;
  v_q public.bm_questions;
  v_row public.bm_questions;
  v_stopped jsonb := null;
begin
  select q.session_id into v_session from public.bm_questions q
  join public.bm_sessions s on s.id = q.session_id and s.deleted_at is null
  where q.id = p_id and q.deleted_at is null;
  if v_session is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- One start at a time per mock.
  perform 1 from public.bm_sessions where id = v_session for update;
  select * into v_q from public.bm_questions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_q.timer_started_at is not null then
    return jsonb_build_object('status', 'running', 'row', to_jsonb(v_q), 'stopped', null, 'now', now(), 'action_id', null);
  end if;

  update public.bm_questions
  set actual_seconds = greatest(0, floor(extract(epoch from (now() - timer_started_at))))::int,
      timer_started_at = null, updated_at = now()
  where session_id = v_session and deleted_at is null and timer_started_at is not null and id <> p_id
  returning to_jsonb(bm_questions.*) into v_stopped;

  update public.bm_questions set timer_started_at = now(), updated_at = now() where id = p_id returning * into v_row;

  return jsonb_build_object('status', 'started', 'row', to_jsonb(v_row), 'stopped', v_stopped, 'now', now(), 'action_id', null);
end;
$$;

-- Stops it: actual_seconds becomes the elapsed whole seconds. Not running: 'not_running'.
create function public.stop_bm_timer(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_q public.bm_questions;
  v_row public.bm_questions;
begin
  select q.* into v_q from public.bm_questions q
  join public.bm_sessions s on s.id = q.session_id and s.deleted_at is null
  where q.id = p_id and q.deleted_at is null
  for update of q;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_q.timer_started_at is null then
    return jsonb_build_object('status', 'not_running', 'row', to_jsonb(v_q), 'now', now(), 'action_id', null);
  end if;
  update public.bm_questions
  set actual_seconds = greatest(0, floor(extract(epoch from (now() - timer_started_at))))::int,
      timer_started_at = null, updated_at = now()
  where id = p_id
  returning * into v_row;
  return jsonb_build_object('status', 'stopped', 'row', to_jsonb(v_row), 'now', now(), 'action_id', null);
end;
$$;

-- Retry: one more retry, the time cleared, and a running stopwatch stopped (without saving).
-- The recorded time is always the final attempt's.
create function public.retry_bm_question(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.bm_questions;
begin
  update public.bm_questions q
  set retries = q.retries + 1, actual_seconds = null, timer_started_at = null, updated_at = now()
  where q.id = p_id and q.deleted_at is null
    and exists (select 1 from public.bm_sessions s where s.id = q.session_id and s.deleted_at is null)
  returning q.* into v_row;
  if v_row.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'now', now(), 'action_id', null);
end;
$$;

-- ---- Undo covers both tables --------------------------------------------------------------------------
-- Full list: start from the latest definition when changing it (20261113153000_saved_spends).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases', 'spending', 'life_experiences', 'eod_answers',
                              'callback_updates', 'chess_notes', 'saved_spends', 'bm_sessions', 'bm_questions'])
$$;

-- ---- Execute rights: the logged-in role only ----------------------------------------------------------

revoke execute on function
  public.set_application_job_description(uuid, text, text),
  public.set_bm_prompt(text, text, text),
  public.bm_session_overall(uuid),
  public.bm_sessions_overview(),
  public.bm_trends_by_area(),
  public.bm_trends_overall(),
  public.bm_json_number(jsonb, numeric, numeric, numeric),
  public.start_bm_session(uuid, text, text, text, boolean, date, text),
  public.save_bm_questions(uuid, jsonb, text, text),
  public.update_bm_session(uuid, jsonb, text),
  public.update_bm_question(uuid, jsonb, text),
  public.delete_bm_session(uuid, text),
  public.delete_bm_question(uuid, text),
  public.start_bm_timer(uuid),
  public.stop_bm_timer(uuid),
  public.retry_bm_question(uuid)
from public, anon;
grant execute on function
  public.set_application_job_description(uuid, text, text),
  public.set_bm_prompt(text, text, text),
  public.bm_session_overall(uuid),
  public.bm_sessions_overview(),
  public.bm_trends_by_area(),
  public.bm_trends_overall(),
  public.bm_json_number(jsonb, numeric, numeric, numeric),
  public.start_bm_session(uuid, text, text, text, boolean, date, text),
  public.save_bm_questions(uuid, jsonb, text, text),
  public.update_bm_session(uuid, jsonb, text),
  public.update_bm_question(uuid, jsonb, text),
  public.delete_bm_session(uuid, text),
  public.delete_bm_question(uuid, text),
  public.start_bm_timer(uuid),
  public.stop_bm_timer(uuid),
  public.retry_bm_question(uuid)
to authenticated;
