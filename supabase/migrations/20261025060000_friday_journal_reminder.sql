-- A reminder every Friday morning to update the work journal, added to the same list
-- as any other reminder (Tabs page), due that day. Done or dismiss it like the rest.
--
-- public.add_scheduled_reminder(body) is reusable: another recurring reminder is just
-- another cron.schedule line. It skips the insert while an identical reminder is still
-- open, so a missed week doesn't stack up copies. Logs an actions row (tool 'schedule'),
-- so Undo works on it too.

create function public.add_scheduled_reminder(p_body text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_day date;
  v_row public.reminders;
  v_action uuid;
begin
  -- Today's logical date in the owner's timezone (4am rule).
  select (now() at time zone s.timezone - interval '4 hours')::date into v_day from public.settings s where s.id = 1;

  if exists (select 1 from public.reminders where body = p_body and done_at is null and deleted_at is null) then
    return jsonb_build_object('status', 'skipped');
  end if;

  insert into public.reminders (noted_date, body, due_date) values (v_day, p_body, v_day) returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values ('schedule', 'reminders', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function public.add_scheduled_reminder(text) from public, anon, authenticated;

-- Fridays at 12:00 UTC: 8am in Boston during daylight time, 7am in winter.
select cron.schedule('friday-work-journal', '0 12 * * 5', $$select public.add_scheduled_reminder('Update your work journal')$$);
