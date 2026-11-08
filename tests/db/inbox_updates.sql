-- Inbox updates: "Yes, update" applies a pending update to Applications (and Callbacks
-- for an OA or interview) and clears it; the owner can't create pending updates
-- themselves (only the scan, as the server, can).

select pg_temp.ok('the owner cannot write pending updates directly',
  pg_temp.err('insert into public.inbox_messages (message_id, kind) values (''zz-x'', ''rejection'')') = '42501');

-- Set up as the server would.
reset role;
insert into public.inbox_messages (message_id, kind) values ('zz-msg-1', 'interview_invite'), ('zz-msg-2', 'confirmation');
set local role authenticated;

select pg_temp.put('app', public.save_application('ZZ Inbox Co', 'SWE Intern', '2099-01-01', 'Applied')->'row'->>'id');

reset role;
insert into public.pending_inbox_updates (message_id, kind, company, role, email_date, application_id, proposed_status)
values ('zz-msg-1', 'interview_invite', 'ZZ Inbox Co', 'SWE Intern', '2099-01-05', pg_temp.get('app')::uuid, 'Interview'),
       ('zz-msg-2', 'confirmation', 'ZZ Brand New Co', 'Data Intern', '2099-01-06', null, 'Applied');
set local role authenticated;

select pg_temp.put('p1', (select id::text from public.pending_inbox_updates where message_id = 'zz-msg-1'));
select pg_temp.put('p2', (select id::text from public.pending_inbox_updates where message_id = 'zz-msg-2'));

select pg_temp.ok('Yes on an interview invite reports saved',
  public.apply_inbox_update(pg_temp.get('p1')::uuid)->>'status' = 'saved');
select pg_temp.ok('the tracked application moves to Interview',
  (select status from public.applications where id = pg_temp.get('app')::uuid) = 'Interview');
select pg_temp.ok('an interview is logged in Callbacks for that company',
  exists (select 1 from public.callbacks where company = 'ZZ Inbox Co' and kind = 'Interview' and logical_date = '2099-01-05' and deleted_at is null));
select pg_temp.ok('the pending update is cleared',
  not exists (select 1 from public.pending_inbox_updates where id = pg_temp.get('p1')::uuid));

select public.apply_inbox_update(pg_temp.get('p2')::uuid);
select pg_temp.ok('Yes on a confirmation for an untracked company adds it as Applied',
  exists (select 1 from public.applications where company = 'ZZ Brand New Co' and position = 'Data Intern'
          and applied_date = '2099-01-06' and status = 'Applied' and deleted_at is null));
select pg_temp.ok('a confirmation logs nothing in Callbacks',
  not exists (select 1 from public.callbacks where company = 'ZZ Brand New Co'));

select pg_temp.ok('an update already handled reports not_found',
  public.apply_inbox_update(pg_temp.get('p2')::uuid)->>'status' = 'not_found');
select pg_temp.ok('the message stays remembered, so it is never scanned again',
  exists (select 1 from public.inbox_messages where message_id = 'zz-msg-2'));
