-- Chess: an optional note on each chess.com game. Games are read live from chess.com and
-- never stored, so a note is keyed by the game's chess.com URL, one row per game.
-- Clearing a note soft-deletes it; writing one again revives that same row, so the URL
-- stays unique and Undo can step back through every version.
--
-- Same conventions as the other slices: security invoker, actions row per write (so Undo
-- works), jsonb { status, row, action_id } results, soft delete.

create table public.chess_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  game_url text not null unique,
  -- Stored exactly as typed; blank (only spaces, tabs or line breaks) means no note.
  body text not null check (btrim(body, E' \t\r\n') <> ''),
  deleted_at timestamptz
);

alter table public.chess_notes enable row level security;
grant select, insert, update on public.chess_notes to authenticated;
create policy owner_all on public.chess_notes for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- The one write. Blank text clears the game's live note (not_found when there's none);
-- other text adds the note, or replaces it, reviving a cleared one. The same text again
-- writes nothing and comes back with action_id null.
create function public.set_chess_note(p_url text, p_body text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.chess_notes;
  v_found boolean;
  v_row public.chess_notes;
  v_action uuid;
begin
  select * into v_before from public.chess_notes where game_url = p_url for update;
  v_found := found;

  if btrim(coalesce(p_body, ''), E' \t\r\n') = '' then
    if not v_found or v_before.deleted_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    update public.chess_notes set deleted_at = now(), updated_at = now() where id = v_before.id returning * into v_row;
  elsif not v_found then
    insert into public.chess_notes (game_url, body) values (p_url, p_body) returning * into v_row;
  elsif v_before.deleted_at is null and v_before.body = p_body then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_before), 'action_id', null);
  else
    update public.chess_notes set body = p_body, deleted_at = null, updated_at = now()
    where id = v_before.id
    returning * into v_row;
  end if;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'chess_notes', v_row.id, case when v_found then to_jsonb(v_before) end, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Full list: start from the latest definition when changing it (20261113110000_callback_updates).
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
                              'callback_updates', 'chess_notes'])
$$;

revoke execute on function public.set_chess_note(text, text, text) from public, anon;
grant execute on function public.set_chess_note(text, text, text) to authenticated;
