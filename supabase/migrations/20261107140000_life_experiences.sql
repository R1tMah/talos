-- Recommendations & Experiences: things people recommend (pending) and the archive of
-- ones done (completed), by fixed category. Logged by hand or from chat ("add Atomic
-- Habits to books, recommended by Sarah", "I finished Atomic Habits"). Completing can
-- carry an optional one-line note and a 1–5 rating. Something already done can be added
-- straight to the archive.
--
-- Same conventions as the other slices: security invoker, actions row per write (so Undo
-- works), jsonb { status, row, action_id } results, soft delete.

create table public.life_experiences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null check (btrim(title) <> ''),
  category text not null check (category in ('Books', 'Podcasts', 'Financial Vehicles', 'Travel Experiences',
                                             'Wellness Routines', 'Career Strategies', 'Movies & TV', 'Physical Hobbies',
                                             'Restaurants & Dining', 'Music')),
  recommended_by text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  note text,
  rating smallint check (rating between 1 and 5),
  deleted_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

create index life_experiences_live on public.life_experiences (status, category) where deleted_at is null;

alter table public.life_experiences enable row level security;
grant select, insert, update on public.life_experiences to authenticated;
create policy owner_all on public.life_experiences for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- A pending item with the same title (any case) comes back as a conflict instead of a second row.
create function public.add_experience(
  p_title text, p_category text, p_recommended_by text default null, p_completed boolean default false,
  p_note text default null, p_rating smallint default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.life_experiences;
  v_row public.life_experiences;
  v_action uuid;
begin
  select * into v_existing from public.life_experiences
  where lower(btrim(title)) = lower(btrim(p_title)) and status = 'pending' and deleted_at is null
  limit 1;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.life_experiences (title, category, recommended_by, status, completed_at, note, rating)
  values (btrim(p_title), p_category, nullif(btrim(p_recommended_by), ''),
          case when coalesce(p_completed, false) then 'completed' else 'pending' end,
          case when coalesce(p_completed, false) then now() end,
          case when coalesce(p_completed, false) then nullif(btrim(p_note), '') end,
          case when coalesce(p_completed, false) then p_rating end)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'life_experiences', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Checks a pending item off. Already completed or missing: not_found.
create function public.complete_experience(
  p_id uuid, p_note text default null, p_rating smallint default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.life_experiences;
  v_row public.life_experiences;
  v_action uuid;
begin
  select * into v_before from public.life_experiences where id = p_id and status = 'pending' and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.life_experiences
  set status = 'completed', completed_at = now(), note = nullif(btrim(p_note), ''), rating = p_rating
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'life_experiences', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Edits the text fields; the note and rating only stick on a completed item.
create function public.update_experience(
  p_id uuid, p_title text, p_category text, p_recommended_by text, p_note text, p_rating smallint, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.life_experiences;
  v_row public.life_experiences;
  v_action uuid;
begin
  select * into v_before from public.life_experiences where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.life_experiences
  set title = btrim(p_title), category = p_category, recommended_by = nullif(btrim(p_recommended_by), ''),
      note = case when status = 'completed' then nullif(btrim(p_note), '') end,
      rating = case when status = 'completed' then p_rating end
  where id = p_id
  returning * into v_row;

  if to_jsonb(v_row) = to_jsonb(v_before) then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', null);
  end if;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'life_experiences', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_experience(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.life_experiences;
  v_row public.life_experiences;
  v_action uuid;
begin
  select * into v_before from public.life_experiences where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.life_experiences set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'life_experiences', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Full list: start from the latest definition when changing it (20261025200000_spending).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases', 'spending', 'life_experiences'])
$$;

-- ---- Archivable like the other tabs ------------------------------------------------------

-- Full list: start from the latest definition when changing it (20261107100000_behavioral_mocks).
alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning', 'behavioral', 'experiences']);

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
  if p_tab is null or p_tab not in ('leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm', 'aiassisted', 'learning', 'behavioral', 'experiences') then
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

revoke execute on function
  public.add_experience(text, text, text, boolean, text, smallint, text),
  public.complete_experience(uuid, text, smallint, text),
  public.update_experience(uuid, text, text, text, text, smallint, text),
  public.delete_experience(uuid, text)
from public, anon;

grant execute on function
  public.add_experience(text, text, text, boolean, text, smallint, text),
  public.complete_experience(uuid, text, smallint, text),
  public.update_experience(uuid, text, text, text, text, smallint, text),
  public.delete_experience(uuid, text)
to authenticated;
