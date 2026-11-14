-- Callback updates: a thread of updates and nested replies under a callback, edits,
-- soft delete that keeps replies, and Undo.

select pg_temp.put('cb', public.log_callback('2026-11-01', 'Threadco', 'Interview')->'row'->>'id');

select pg_temp.put('u1', public.add_callback_update(pg_temp.get('cb')::uuid, 'Recruiter said next week')::text);
select pg_temp.put('u1_id', pg_temp.get('u1')::jsonb->'row'->>'id');
select pg_temp.ok('a top-level update is saved exactly as typed',
  exists (select 1 from public.callback_updates where id = pg_temp.get('u1_id')::uuid
          and body = 'Recruiter said next week' and parent_id is null and callback_id = pg_temp.get('cb')::uuid));

select pg_temp.put('r1_id', public.add_callback_update(pg_temp.get('cb')::uuid, 'Scheduled for Tue', pg_temp.get('u1_id')::uuid)->'row'->>'id');
select pg_temp.ok('a reply hangs off its parent',
  exists (select 1 from public.callback_updates where id = pg_temp.get('r1_id')::uuid and parent_id = pg_temp.get('u1_id')::uuid));

select pg_temp.put('cb2', public.log_callback('2026-11-02', 'Otherco', 'OA')->'row'->>'id');
select pg_temp.ok('a reply to an update in another thread is not_found',
  (public.add_callback_update(pg_temp.get('cb2')::uuid, 'x', pg_temp.get('u1_id')::uuid)->>'status') = 'not_found');
select pg_temp.ok('an empty body is rejected',
  pg_temp.err(format($$select public.add_callback_update(%L::uuid, '   ')$$, pg_temp.get('cb'))) = '23514');

select pg_temp.put('ed', public.edit_callback_update(pg_temp.get('u1_id')::uuid, 'Recruiter said Tuesday')->>'action_id');
select pg_temp.ok('editing changes the text and marks it edited',
  exists (select 1 from public.callback_updates where id = pg_temp.get('u1_id')::uuid and body = 'Recruiter said Tuesday' and edited_at is not null));
select pg_temp.ok('editing to the same text is a no-op',
  (public.edit_callback_update(pg_temp.get('u1_id')::uuid, 'Recruiter said Tuesday')->>'action_id') is null);
select public.undo_action(pg_temp.get('ed')::uuid);
select pg_temp.ok('undoing the edit restores the text',
  exists (select 1 from public.callback_updates where id = pg_temp.get('u1_id')::uuid and body = 'Recruiter said next week' and edited_at is null));

select pg_temp.put('del', public.delete_callback_update(pg_temp.get('u1_id')::uuid)->>'action_id');
select pg_temp.ok('deleting a parent is a soft delete and keeps its reply',
  exists (select 1 from public.callback_updates where id = pg_temp.get('u1_id')::uuid and deleted_at is not null)
  and exists (select 1 from public.callback_updates where id = pg_temp.get('r1_id')::uuid and deleted_at is null));
select pg_temp.ok('a deleted update can still be replied to while its thread shows it',
  (public.add_callback_update(pg_temp.get('cb')::uuid, 'late reply', pg_temp.get('u1_id')::uuid)->>'status') = 'saved');
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undoing the delete brings it back',
  exists (select 1 from public.callback_updates where id = pg_temp.get('u1_id')::uuid and deleted_at is null));
