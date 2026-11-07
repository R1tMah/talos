-- EOD also reviews reminders: the EOD card lists open reminders due today or overdue,
-- and the ones ticked there are marked done by Save EOD, in the same transaction as the
-- journal entries and spending. Each completion gets its own actions row (like
-- complete_reminder), so it can be undone on its own.

drop function public.save_eod(date, jsonb, jsonb, text);

-- p_done: reminder ids to mark done. One already done or dismissed is left alone.
create function public.save_eod(
  p_date date, p_notes jsonb, p_spending jsonb, p_done uuid[] default '{}', p_tool text default 'eod'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_note public.notes;
  v_spend public.spending;
  v_before public.reminders;
  v_rem public.reminders;
  v_action uuid;
  v_saved jsonb := '[]';
  v_id uuid;
  e jsonb;
begin
  if jsonb_typeof(coalesce(p_notes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_spending, '[]')) <> 'array' then
    raise exception 'p_notes and p_spending must be json arrays';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_notes, '[]')) loop
    if e->>'kind' not in ('journal', 'personal', 'content', 'talos') or btrim(coalesce(e->>'body', '')) = '' then
      raise exception 'bad EOD note: %', e;
    end if;
    insert into public.notes (kind, logical_date, body) values (e->>'kind', p_date, e->>'body') returning * into v_note;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'notes', v_note.id, null, to_jsonb(v_note)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'notes', 'row', to_jsonb(v_note), 'action_id', v_action);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_spending, '[]')) loop
    if (e->>'amount')::numeric is null or (e->>'amount')::numeric <= 0 or btrim(coalesce(e->>'what', '')) = '' then
      raise exception 'bad EOD spending: %', e;
    end if;
    insert into public.spending (logical_date, amount, what, category)
    values (p_date, round((e->>'amount')::numeric, 2), btrim(e->>'what'), coalesce(e->>'category', 'Other'))
    returning * into v_spend;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'spending', v_spend.id, null, to_jsonb(v_spend)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'spending', 'row', to_jsonb(v_spend), 'action_id', v_action);
  end loop;

  foreach v_id in array coalesce(p_done, '{}') loop
    select * into v_before from public.reminders where id = v_id and deleted_at is null and done_at is null for update;
    continue when not found;
    update public.reminders set done_at = now() where id = v_id returning * into v_rem;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'reminders', v_id, to_jsonb(v_before), to_jsonb(v_rem)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'reminders', 'row', to_jsonb(v_rem), 'action_id', v_action);
  end loop;

  if jsonb_array_length(v_saved) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;
  return jsonb_build_object('status', 'saved', 'saved', v_saved);
end;
$$;

revoke execute on function public.save_eod(date, jsonb, jsonb, uuid[], text) from public, anon;
grant execute on function public.save_eod(date, jsonb, jsonb, uuid[], text) to authenticated;
