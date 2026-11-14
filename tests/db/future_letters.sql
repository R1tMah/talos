-- Future letters: the owner can seal, postpone and delete a letter, but can never read
-- a sealed letter's text, open it early, or bring its date forward.

insert into public.future_letters (body, written_at, deliver_at)
values ('ZZ secret to future me', now() - interval '1 year', now() + interval '1 year');
select pg_temp.put('id', (select id::text from public.future_letters where deliver_at = now() + interval '1 year' order by created_at desc limit 1));
select pg_temp.ok('a letter seals, and its dates can be read', pg_temp.get('id') is not null);

select pg_temp.ok('its text cannot be read (no select on body)',
  pg_temp.err('select body from public.future_letters') = '42501');
select pg_temp.ok('select * is refused too, so nothing fetches the text by accident',
  pg_temp.err('select * from public.future_letters') = '42501');
select pg_temp.ok('a sealed letter is not among the opened letters',
  not exists (select 1 from public.opened_letters() where id = pg_temp.get('id')::uuid));

select pg_temp.ok('it cannot be opened early by the owner',
  pg_temp.err(format('update public.future_letters set opened_at = now() where id = %L', pg_temp.get('id'))) = '42501');
select pg_temp.ok('its date cannot be brought forward',
  pg_temp.err(format('update public.future_letters set deliver_at = now() + interval ''1 day'' where id = %L', pg_temp.get('id'))) is not null);
select pg_temp.ok('its date can be pushed later',
  pg_temp.err(format('update public.future_letters set deliver_at = now() + interval ''2 years'' where id = %L', pg_temp.get('id'))) is null);
select pg_temp.ok('opening due letters is the server''s job, not the owner''s',
  pg_temp.err('select public.open_due_letters()') = '42501');

select pg_temp.ok('a letter that unlocks in the past cannot be sealed',
  pg_temp.err('insert into public.future_letters (body, deliver_at) values (''x'', now() - interval ''1 minute'')') is not null);
select pg_temp.ok('an empty letter cannot be sealed',
  pg_temp.err('insert into public.future_letters (body, deliver_at) values (''  '', now() + interval ''1 day'')') is not null);

-- Delete in one statement and look in the next: a statement keeps the snapshot it
-- started with, so a check in the same statement would still see the row.
select pg_temp.put('del', coalesce(pg_temp.err(format('delete from public.future_letters where id = %L', pg_temp.get('id'))), 'ok'));
select pg_temp.ok('a sealed letter can be deleted',
  pg_temp.get('del') = 'ok' and not exists (select 1 from public.future_letters where id = pg_temp.get('id')::uuid),
  pg_temp.get('del'));
