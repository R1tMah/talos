-- Long Term: the owner's seasons (a semester, a summer, a winter break), each with the
-- plan they wrote at the start and the dated updates and reviews they wrote along the
-- way. Everything is the owner's text, stored verbatim: never rewritten, summarized,
-- scored or interpreted. Seasons keep the order they were written in (position).
-- The content itself is loaded once by hand, not from this file (it's personal).

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  position int not null,                -- order written; highest = current season
  name text not null check (btrim(name) <> ''),
  plan text not null default '',        -- the goals block, verbatim
  deleted_at timestamptz
);

create table public.season_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season_id uuid not null references public.seasons (id),
  noted_on date,                        -- inferred from the season's year; null if unknown
  label text,                           -- the heading as written: 'Notes: (as of Dec 16th)', 'Update 5/17:'
  body text not null check (btrim(body) <> ''),
  position int not null,                -- order within the season
  deleted_at timestamptz
);

create index season_notes_season_idx on public.season_notes (season_id, position) where deleted_at is null;

alter table public.seasons enable row level security;
alter table public.season_notes enable row level security;
grant select, insert, update on public.seasons, public.season_notes to authenticated;
create policy owner_all on public.seasons for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.season_notes for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Writes (each logs an actions row, so Undo works) --------------------------------

create function public.add_season(p_name text, p_plan text, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_row public.seasons; v_action uuid;
begin
  insert into public.seasons (position, name, plan)
  values ((select coalesce(max(position), 0) + 1 from public.seasons), p_name, coalesce(p_plan, ''))
  returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'seasons', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

-- Name and plan, saved exactly as given.
create function public.update_season(p_id uuid, p_name text, p_plan text, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_before public.seasons; v_row public.seasons; v_action uuid;
begin
  select * into v_before from public.seasons where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  update public.seasons set name = p_name, plan = p_plan where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'seasons', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

create function public.add_season_note(p_season_id uuid, p_date date, p_label text, p_body text, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_row public.season_notes; v_action uuid;
begin
  if not exists (select 1 from public.seasons where id = p_season_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.season_notes (season_id, noted_on, label, body, position)
  values (p_season_id, p_date, nullif(btrim(p_label), ''), p_body,
          (select coalesce(max(position), 0) + 1 from public.season_notes where season_id = p_season_id))
  returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'season_notes', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

create function public.update_season_note(p_id uuid, p_date date, p_label text, p_body text, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_before public.season_notes; v_row public.season_notes; v_action uuid;
begin
  select * into v_before from public.season_notes where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  update public.season_notes set noted_on = p_date, label = nullif(btrim(p_label), ''), body = p_body
  where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'season_notes', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

create function public.delete_season_note(p_id uuid, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_before public.season_notes; v_row public.season_notes; v_action uuid;
begin
  select * into v_before from public.season_notes where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  update public.season_notes set deleted_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'season_notes', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

-- ---- Undo --------------------------------------------------------------------------

-- Full list: start from the latest definition when changing it (20261024030000_subscriptions).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes'])
$$;

revoke execute on function
  public.add_season(text, text, text), public.update_season(uuid, text, text, text),
  public.add_season_note(uuid, date, text, text, text), public.update_season_note(uuid, date, text, text, text),
  public.delete_season_note(uuid, text)
from public, anon;
grant execute on function
  public.add_season(text, text, text), public.update_season(uuid, text, text, text),
  public.add_season_note(uuid, date, text, text, text), public.update_season_note(uuid, date, text, text, text),
  public.delete_season_note(uuid, text)
to authenticated;
