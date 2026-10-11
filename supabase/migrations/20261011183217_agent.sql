-- Agent support: message log, server-side proposals, and app-wide undo/redo.

-- ---- Message log ---------------------------------------------------------------
-- One row per chat message. client_msg_id dedupes double sends; the stored response
-- is returned again for a duplicate. Also the record for tuning the threshold.
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  client_msg_id text not null unique,
  created_at timestamptz not null default now(),
  text text not null,
  route text,              -- 'rule' | 'model'
  model text,
  tool_calls jsonb,        -- what was proposed, before code checks
  response jsonb,          -- the cards returned
  corrected boolean not null default false
);

-- ---- Proposals -----------------------------------------------------------------
-- Writes waiting on the owner (confirm, pick one of three, fill missing fields).
-- Stored server-side so the client can only point at one, never change what it says.
create table public.pending_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day',
  message_id uuid references public.message_log(id),
  tool text not null,
  args jsonb not null,
  used_at timestamptz
);

alter table public.message_log enable row level security;
alter table public.pending_proposals enable row level security;
grant select, insert, update on public.message_log, public.pending_proposals to authenticated;
create policy owner_all on public.message_log for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.pending_proposals for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Undo / redo -----------------------------------------------------------------
-- An undo is itself a logged action (tool 'undo') that points at what it reverted.
-- Redo reverts that undo (tool 'redo') and makes the original undoable again.
alter table public.actions add column reverts uuid references public.actions(id);

-- Tables undo may touch. Anything else is refused.
create function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes', 'applications'])
$$;

-- Reverts one action: an insert is soft-deleted, an update or delete restores the
-- row as it was before. With no id, reverts the latest action not yet undone.
-- If the row changed after that action, nothing is written and 'conflict' comes back.
-- Returns { status: 'done', action, redo_id } | { status: 'nothing' | 'conflict' | 'not_found' | 'unsupported' }.
create function public.undo_action(p_action_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_act public.actions;
  v_cur jsonb;
  v_target jsonb;
  v_new jsonb;
  v_cols text;
  v_tool text;
  v_id uuid;
begin
  if p_action_id is null then
    select * into v_act from public.actions
    where undone_at is null and tool not in ('undo', 'redo') and row_id is not null
    order by created_at desc limit 1
    for update;
    if not found then
      return jsonb_build_object('status', 'nothing');
    end if;
  else
    select * into v_act from public.actions where id = p_action_id and undone_at is null for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
  end if;

  if not public.undoable_table(v_act.table_name) or v_act.row_id is null then
    return jsonb_build_object('status', 'unsupported');
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1', v_act.table_name) into v_cur using v_act.row_id;
  if v_cur is distinct from v_act.after then
    return jsonb_build_object('status', 'conflict', 'action', to_jsonb(v_act));
  end if;

  -- Insert: soft delete. Update/delete: back to the row as it was.
  v_target := case when v_act.before is null then v_cur || jsonb_build_object('deleted_at', now()) else v_act.before end;

  select string_agg(format('%I = r.%I', column_name, column_name), ', ') into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = v_act.table_name and column_name <> 'id';

  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 returning to_jsonb(t)',
                 v_act.table_name, v_cols, v_act.table_name)
    into v_new using v_target, v_act.row_id;

  -- Undoing an undo is a redo: the original becomes undoable again.
  v_tool := case when v_act.tool = 'undo' then 'redo' else 'undo' end;
  if v_tool = 'redo' then
    update public.actions set undone_at = null where id = v_act.reverts;
  end if;
  update public.actions set undone_at = now() where id = v_act.id;

  insert into public.actions (tool, table_name, row_id, before, after, reverts)
  values (v_tool, v_act.table_name, v_act.row_id, v_cur, v_new, v_act.id)
  returning id into v_id;

  return jsonb_build_object(
    'status', 'done',
    'kind', v_tool,
    -- What was reverted, described from the original action for the app's message.
    'action', (select to_jsonb(a) from public.actions a where a.id = coalesce(case when v_tool = 'redo' then v_act.reverts end, v_act.id)),
    'redo_id', case when v_tool = 'undo' then v_id end
  );
end;
$$;

revoke execute on function public.undoable_table(text), public.undo_action(uuid) from public, anon;
grant execute on function public.undoable_table(text), public.undo_action(uuid) to authenticated;
