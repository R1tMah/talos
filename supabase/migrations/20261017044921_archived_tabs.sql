-- Archived tabs: hidden from the Tabs page (listed in an accordion at the bottom),
-- still reachable, data untouched. Chat refuses to write to an archived tab.
-- Weight and Nutrition can't be archived. Stored on the settings row so it's the
-- same on every device.

alter table public.settings add column archived_tabs text[] not null default '{}'
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal']);

create function public.set_tab_archived(p_tab text, p_archived boolean, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.settings;
  v_row public.settings;
begin
  if p_tab is null or p_tab not in ('leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal') then
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

revoke execute on function public.set_tab_archived(text, boolean, text) from public, anon;
grant execute on function public.set_tab_archived(text, boolean, text) to authenticated;
