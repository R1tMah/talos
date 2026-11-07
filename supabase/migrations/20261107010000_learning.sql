-- Learning: AI-built curriculums. The Architect model (server, app/api/learning) writes a
-- curriculum and its modules in one call; the Tutor model teaches one module at a time in
-- a chat whose messages are kept here. Dates follow the owner's cadence: unfinished
-- modules always sit on the next cadence days (lib/learning/schedule.ts), so a missed day
-- shifts the rest and finishing early pulls them forward. scheduled_date is rewritten by
-- the app after every change.
--
-- Written by the app's server routes as the owner (RLS applies). Generated content, so
-- no actions rows / Undo; nothing is hard-deleted (replaced modules keep replaced_at).

create table public.curriculums (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  topic text not null check (btrim(topic) <> ''),
  context text not null default '',
  -- Weekdays, 0 = Sunday … 6 = Saturday.
  cadence smallint[] not null check (cardinality(cadence) between 1 and 7 and cadence <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  title text,
  goal text,
  status text not null default 'generating' check (status in ('generating', 'active', 'done', 'failed')),
  error text,
  deleted_at timestamptz
);

create table public.curriculum_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  curriculum_id uuid not null references public.curriculums (id),
  position int not null,
  title text not null,
  objective text not null,     -- what "got it" means; the Tutor judges against this
  bullets text[] not null check (cardinality(bullets) between 1 and 4),
  diagram text not null,       -- Mermaid source, written by the Architect
  diagram_caption text,
  opening_question text not null,
  scheduled_date date,
  completed_at timestamptz,
  completed_by text check (completed_by in ('tutor', 'manual')),
  replaced_at timestamptz      -- set when Recalibrate swaps it for gentler modules
);

create index curriculum_modules_order on public.curriculum_modules (curriculum_id, position);

create table public.module_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  module_id uuid not null references public.curriculum_modules (id),
  role text not null check (role in ('user', 'assistant')),
  content text not null
);

create index module_messages_order on public.module_messages (module_id, created_at);

alter table public.curriculums enable row level security;
alter table public.curriculum_modules enable row level security;
alter table public.module_messages enable row level security;
grant select, insert, update on public.curriculums, public.curriculum_modules, public.module_messages to authenticated;
create policy owner_all on public.curriculums for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.curriculum_modules for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.module_messages for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Learning can be archived like the other tabs ----------------------------------------

-- Full list: start from the latest definition when changing it (20261025210000_aiassisted_notes).
alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning']);

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
  if p_tab is null or p_tab not in ('leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning') then
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

-- ---- Retiring System Design Prep (replaced by Learning) ----------------------------------
-- The Watch card goes; prep_completions stays as a record. The 'prep' kind stays allowed
-- by the check so old backups still restore.
delete from public.watch_sources where kind = 'prep';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sunday-sysdesign-mock') then
    perform cron.unschedule('sunday-sysdesign-mock');
  end if;
end;
$$;
