-- Long Term (seasons) can be archived like the other tabs. It lives on the Journals page.
-- Full list: start from the latest definition when changing it (20261025070000_sysdesign_notes).
alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm']);

-- set_tab_archived kept its own list from when only six tabs existed, so archiving the
-- tabs added since (personal, talos, sysdesign) was refused. It now allows the same keys
-- as the column's check above; keep the two lists together.
create or replace function public.set_tab_archived(p_tab text, p_archived boolean, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.settings;
  v_row public.settings;
begin
  if p_tab is null or p_tab not in ('leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign', 'longterm') then
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
