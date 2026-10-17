-- Applications and callbacks (#55, #57, #62, #63, #65-#68).

-- #55 Supplying every field creates one row.
select pg_temp.put('app', public.save_application('ZZ Test Co', 'SWE', '2099-06-01', 'Applied', null)->'row'->>'id');
select pg_temp.ok('#55 an application with every field creates one row',
  (select count(*) from public.applications where company = 'ZZ Test Co' and deleted_at is null) = 1);

-- #57 Confirming a status change updates it; Undo restores the old one.
select pg_temp.put('act', public.update_application(pg_temp.get('app')::uuid, 'ZZ Test Co', 'SWE', '2099-06-01', 'Rejected', null)->>'action_id');
select pg_temp.ok('#57 confirming updates the status',
  (select status from public.applications where id = pg_temp.get('app')::uuid) = 'Rejected');
select public.undo_action(pg_temp.get('act')::uuid);
select pg_temp.ok('#57 ...and Undo restores the old status',
  (select status from public.applications where id = pg_temp.get('app')::uuid) = 'Applied');

-- #62 / #63 The debrief is saved byte for byte: profanity, emoji, whitespace.
select pg_temp.put('cb', public.log_callback('2099-06-02', 'ZZ Test Co', 'Interview', '508/600', null,
  E'  holy fuck that was insane 😭\n\nthey asked binary lifting   ')->'row'->>'id');
select pg_temp.ok('#62 the debrief is saved byte for byte, profanity and emoji included',
  (select debrief from public.callbacks where id = pg_temp.get('cb')::uuid) = E'  holy fuck that was insane 😭\n\nthey asked binary lifting   ');
select public.set_debrief(pg_temp.get('cb')::uuid, E'\tadded later  \n');
select pg_temp.ok('#63 an edited debrief is never trimmed or rewritten',
  (select debrief from public.callbacks where id = pg_temp.get('cb')::uuid) = E'\tadded later  \n');

-- #65 Logging a callback doesn't change any application status.
select pg_temp.ok('#65 logging a callback leaves the application status alone',
  (select status from public.applications where id = pg_temp.get('app')::uuid) = 'Applied');
select pg_temp.ok('#65 ...and links it when exactly one application matches',
  (select application_id from public.callbacks where id = pg_temp.get('cb')::uuid) = pg_temp.get('app')::uuid);

-- #66 Interviews and OAs are counted separately.
select public.log_callback('2099-06-03', 'ZZ Test Co', 'OA', null, null, null);
select pg_temp.ok('#66 interview and OA counts are computed separately and match the rows',
  (select n from public.callback_counts where kind = 'Interview') = (select count(*) from public.callbacks where kind = 'Interview' and deleted_at is null)
  and (select n from public.callback_counts where kind = 'OA') = (select count(*) from public.callbacks where kind = 'OA' and deleted_at is null));

-- #67 A callback with no date saves and sorts.
select pg_temp.put('nodate', public.log_callback(null, 'ZZ Undated Co', 'OA', null, null, null)->>'status');
select pg_temp.ok('#67 a callback with a null date saves', pg_temp.get('nodate') = 'saved');
select pg_temp.ok('#67 ...and sorts last without error',
  (select logical_date from public.callbacks where deleted_at is null order by logical_date desc nulls last, created_at desc
   offset (select count(*) - 1 from public.callbacks where deleted_at is null) limit 1) is null);

-- #68 The score is text, unchanged.
select pg_temp.ok('#68 a score like 508/600 is stored as text, unchanged',
  (select score from public.callbacks where id = pg_temp.get('cb')::uuid) = '508/600'
  and (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'callbacks' and column_name = 'score') = 'text');
