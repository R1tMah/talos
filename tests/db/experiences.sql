-- Recommendations & Experiences: add, check off with a note and rating, no duplicate
-- pending titles, a strict category list, edits, and Undo.

select pg_temp.put('rec', public.add_experience('  Atomic Habits ', 'Books', 'Sarah')::text);
select pg_temp.put('rec_id', pg_temp.get('rec')::jsonb->'row'->>'id');
select pg_temp.ok('a recommendation is saved pending, trimmed, with who recommended it',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid
          and title = 'Atomic Habits' and status = 'pending' and recommended_by = 'Sarah' and completed_at is null));
select pg_temp.ok('the same title pending again is a conflict',
  (public.add_experience('atomic habits', 'Books')->>'status') = 'conflict');
select pg_temp.ok('a category outside the list is rejected',
  pg_temp.err($$select public.add_experience('Something', 'Snacks')$$) = '23514');
select pg_temp.ok('Restaurants & Dining and Music are categories',
  (public.add_experience('Joe''s Pizza', 'Restaurants & Dining')->>'status') = 'saved'
  and (public.add_experience('Blonde', 'Music')->>'status') = 'saved');

select pg_temp.put('done', public.complete_experience(pg_temp.get('rec_id')::uuid, ' Loved it ', 5::smallint)->>'action_id');
select pg_temp.ok('checking off sets completed, the time, the note and the rating',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid
          and status = 'completed' and completed_at is not null and note = 'Loved it' and rating = 5));
select pg_temp.ok('checking off twice is not_found',
  (public.complete_experience(pg_temp.get('rec_id')::uuid)->>'status') = 'not_found');
select public.undo_action(pg_temp.get('done')::uuid);
select pg_temp.ok('undoing the check-off puts it back on the list',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid and status = 'pending' and completed_at is null and note is null));

select pg_temp.ok('something already done goes straight to Experiences',
  (public.add_experience('Bouldering class', 'Physical Hobbies', 'Dave', true, 'Hard!', 4::smallint)->'row'->>'status') = 'completed');
select pg_temp.ok('a rating outside 1 to 5 is rejected',
  pg_temp.err($$select public.add_experience('Thing', 'Books', null, true, null, 7::smallint)$$) = '23514');

select public.update_experience(pg_temp.get('rec_id')::uuid, 'Atomic Habits (book)', 'Books', 'Sarah K', 'ignored', 3::smallint);
select pg_temp.ok('editing a pending item changes its text but keeps no note or rating',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid
          and title = 'Atomic Habits (book)' and recommended_by = 'Sarah K' and note is null and rating is null));

select pg_temp.put('del', public.delete_experience(pg_temp.get('rec_id')::uuid)->>'action_id');
select pg_temp.ok('deleting is a soft delete',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid and deleted_at is not null));
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undoing the delete brings it back',
  exists (select 1 from public.life_experiences where id = pg_temp.get('rec_id')::uuid and deleted_at is null));
