-- "To apply" reminders close themselves when the application is added any way at all
-- (the Applications tab, chat, an import), not only through the reminder's own Apply.
--
-- After a new application, open reminders for the same company are linked to it, which
-- is what takes them off the list (open_application_reminders). A reminder matches when
-- the position matches too, or when it's the only open reminder for that company (chat's
-- "applied to Stripe" often has no position). Undoing the application soft-deletes it,
-- and the reminder shows again, since only a live application closes one.

create function public.close_apply_reminders()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_open public.application_reminders[];
begin
  select coalesce(array_agg(r), '{}') into v_open
  from public.application_reminders r
  left join public.applications a on a.id = r.application_id and a.deleted_at is null
  where r.deleted_at is null and a.id is null
    and lower(btrim(r.company)) = lower(btrim(new.company));

  update public.application_reminders r
  set application_id = new.id
  where r.id in (select (x).id from unnest(v_open) x)
    and (lower(btrim(r.position)) = lower(btrim(coalesce(new.position, ''))) or cardinality(v_open) = 1);

  return new;
end;
$$;

create trigger applications_close_apply_reminders
after insert on public.applications
for each row execute function public.close_apply_reminders();
