-- LeetCode slice: catalog lookup, write functions, redo queue and counts.
--
-- The catalog is the source of truth for title, difficulty and topic. When a
-- problem isn't in it, the caller's difficulty/topic are kept and marked
-- inferred only if they came from the model (p_inferred, set by chat).
--
-- Same conventions as the other slices: security invoker (RLS applies), every
-- write also logs an actions row, and each returns jsonb
-- { status: 'saved', row, action_id } | { status: 'ambiguous', candidates } | { status: 'not_found' }.

-- ---- Catalog lookup ------------------------------------------------------------

-- Exact title (case-insensitive) wins; otherwise every problem with that alias.
-- More than one row back means the name is ambiguous.
create function public.lc_lookup(p_title text)
returns setof public.lc_catalog
language sql
stable
set search_path = ''
as $$
  with t as (select lower(trim(p_title)) as k)
  select c.* from public.lc_catalog c, t where lower(c.title) = t.k
  union all
  select c.* from public.lc_catalog c, t
  where t.k = any (c.aliases)
    and not exists (select 1 from public.lc_catalog x, t where lower(x.title) = t.k)
$$;

-- ---- Writes ----------------------------------------------------------------------

create function public.log_leetcode(
  p_date date, p_title text,
  p_minutes numeric default null, p_hints text default null, p_result text default null,
  p_redo boolean default false, p_notes text default null,
  p_difficulty text default null, p_topic text default null, p_inferred boolean default false,
  p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_matches jsonb;
  v_cat public.lc_catalog;
  v_row public.leetcode_log;
  v_action uuid;
begin
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_matches from public.lc_lookup(p_title) c;
  if jsonb_array_length(v_matches) > 1 then
    return jsonb_build_object('status', 'ambiguous', 'candidates', v_matches);
  end if;

  if jsonb_array_length(v_matches) = 1 then
    select * into v_cat from public.lc_lookup(p_title);
    insert into public.leetcode_log (logical_date, title, catalog_id, difficulty, topic, inferred, minutes, hints, result, redo, notes)
    values (p_date, v_cat.title, v_cat.id, v_cat.difficulty, v_cat.topic, false, p_minutes, p_hints, p_result, coalesce(p_redo, false), p_notes)
    returning * into v_row;
  else
    insert into public.leetcode_log (logical_date, title, catalog_id, difficulty, topic, inferred, minutes, hints, result, redo, notes)
    values (p_date, trim(p_title), null, p_difficulty, p_topic,
            coalesce(p_inferred, false) and (p_difficulty is not null or p_topic is not null),
            p_minutes, p_hints, p_result, coalesce(p_redo, false), p_notes)
    returning * into v_row;
  end if;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'leetcode_log', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Replaces every editable field and re-resolves the title against the catalog.
-- Saving from the form is the owner confirming the row, so inferred clears.
create function public.update_leetcode(
  p_id uuid, p_date date, p_title text,
  p_minutes numeric, p_hints text, p_result text, p_redo boolean, p_notes text,
  p_difficulty text, p_topic text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.leetcode_log;
  v_matches jsonb;
  v_cat public.lc_catalog;
  v_row public.leetcode_log;
  v_action uuid;
begin
  select * into v_before from public.leetcode_log where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_matches from public.lc_lookup(p_title) c;
  if jsonb_array_length(v_matches) > 1 then
    return jsonb_build_object('status', 'ambiguous', 'candidates', v_matches);
  end if;

  if jsonb_array_length(v_matches) = 1 then
    select * into v_cat from public.lc_lookup(p_title);
  end if;

  update public.leetcode_log
  set logical_date = p_date,
      title = coalesce(v_cat.title, trim(p_title)),
      catalog_id = v_cat.id,
      difficulty = coalesce(v_cat.difficulty, p_difficulty),
      topic = coalesce(v_cat.topic, p_topic),
      inferred = false,
      minutes = p_minutes, hints = p_hints, result = p_result,
      redo = coalesce(p_redo, false), notes = p_notes
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'leetcode_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Just the redo flag, for "Clear" on the redo queue.
create function public.set_leetcode_redo(p_id uuid, p_redo boolean, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.leetcode_log;
  v_row public.leetcode_log;
  v_action uuid;
begin
  select * into v_before from public.leetcode_log where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.leetcode_log set redo = p_redo where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'leetcode_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_leetcode(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.leetcode_log;
  v_row public.leetcode_log;
  v_action uuid;
begin
  select * into v_before from public.leetcode_log where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.leetcode_log set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'leetcode_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Reads ---------------------------------------------------------------------

-- A problem is queued when its latest attempt has redo set. Oldest first.
-- Logging a new attempt without redo takes it off the queue.
create view public.redo_queue with (security_invoker = true) as
select l.*
from (
  select distinct on (coalesce(catalog_id::text, lower(title))) *
  from public.leetcode_log
  where deleted_at is null
  order by coalesce(catalog_id::text, lower(title)), logical_date desc, created_at desc
) l
where l.redo
order by l.logical_date, l.created_at;

-- Counts for a date range, one row per (dimension, key).
--   attempts / problems (distinct) / days (distinct dates practiced): key = 'all'
--   difficulty / topic / result: key = the value, or 'unknown' / 'unstated' when empty
create function public.leetcode_counts(p_from date, p_to date)
returns table (dimension text, key text, n int)
language sql
stable
set search_path = ''
as $$
  with r as (
    select * from public.leetcode_log
    where deleted_at is null and logical_date between p_from and p_to
  )
  select 'attempts', 'all', count(*)::int from r
  union all select 'problems', 'all', count(distinct coalesce(catalog_id::text, lower(title)))::int from r
  union all select 'days', 'all', count(distinct logical_date)::int from r
  union all select 'difficulty', coalesce(difficulty, 'unknown'), count(*)::int from r group by 2
  union all select 'topic', coalesce(topic, 'unknown'), count(*)::int from r group by 2
  union all select 'result', coalesce(result, 'unstated'), count(*)::int from r group by 2
$$;

-- ---- Access ----------------------------------------------------------------------

grant select on public.redo_queue to authenticated;

revoke execute on function
  public.lc_lookup(text),
  public.log_leetcode(date, text, numeric, text, text, boolean, text, text, text, boolean, text),
  public.update_leetcode(uuid, date, text, numeric, text, text, boolean, text, text, text, text),
  public.set_leetcode_redo(uuid, boolean, text),
  public.delete_leetcode(uuid, text),
  public.leetcode_counts(date, date)
from public, anon;

grant execute on function
  public.lc_lookup(text),
  public.log_leetcode(date, text, numeric, text, text, boolean, text, text, text, boolean, text),
  public.update_leetcode(uuid, date, text, numeric, text, text, boolean, text, text, text, text),
  public.set_leetcode_redo(uuid, boolean, text),
  public.delete_leetcode(uuid, text),
  public.leetcode_counts(date, date)
to authenticated;
