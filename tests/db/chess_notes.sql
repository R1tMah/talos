-- Chess game notes: one per game URL, saved as typed, unchanged text writes nothing,
-- blank text clears, writing again revives the same row, and Undo.

select pg_temp.put('url', 'https://www.chess.com/game/live/test-' || gen_random_uuid());

select pg_temp.put('add', public.set_chess_note(pg_temp.get('url'), E'  Hung my queen\non move 12 ')::text);
select pg_temp.put('id', pg_temp.get('add')::jsonb->'row'->>'id');
select pg_temp.ok('a note is saved exactly as typed, with an action to undo',
  (pg_temp.get('add')::jsonb->>'status') = 'saved'
  and (pg_temp.get('add')::jsonb->>'action_id') is not null
  and exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid
              and game_url = pg_temp.get('url') and body = E'  Hung my queen\non move 12 ' and deleted_at is null));

select pg_temp.put('edit', public.set_chess_note(pg_temp.get('url'), 'Hung my queen')::text);
select pg_temp.ok('editing changes the same row',
  (pg_temp.get('edit')::jsonb->'row'->>'id') = pg_temp.get('id')
  and exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and body = 'Hung my queen')
  and (select count(*) from public.chess_notes where game_url = pg_temp.get('url')) = 1);

select pg_temp.put('same', public.set_chess_note(pg_temp.get('url'), 'Hung my queen')::text);
select pg_temp.ok('the same text again is saved with no action',
  (pg_temp.get('same')::jsonb->>'status') = 'saved' and (pg_temp.get('same')::jsonb->>'action_id') is null
  and not exists (select 1 from public.actions where table_name = 'chess_notes' and row_id = pg_temp.get('id')::uuid
                  and id <> all (array[pg_temp.get('add')::jsonb->>'action_id', pg_temp.get('edit')::jsonb->>'action_id']::uuid[])));

select pg_temp.put('clear', public.set_chess_note(pg_temp.get('url'), E'  \n ')::text);
select pg_temp.ok('blank text clears the note (soft delete)',
  (pg_temp.get('clear')::jsonb->>'status') = 'saved'
  and exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and deleted_at is not null and body = 'Hung my queen'));
select pg_temp.ok('blank text with no live note is not_found',
  (public.set_chess_note(pg_temp.get('url'), '')->>'status') = 'not_found'
  and (public.set_chess_note('https://www.chess.com/game/live/never-noted', '')->>'status') = 'not_found');

select pg_temp.put('revive', public.set_chess_note(pg_temp.get('url'), 'Blundered in time trouble')::text);
select pg_temp.ok('a note again revives the same row',
  (pg_temp.get('revive')::jsonb->'row'->>'id') = pg_temp.get('id')
  and exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and deleted_at is null and body = 'Blundered in time trouble')
  and (select count(*) from public.chess_notes where game_url = pg_temp.get('url')) = 1);

select public.undo_action((pg_temp.get('revive')::jsonb->>'action_id')::uuid);
select pg_temp.ok('undoing the revive clears it again',
  exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and deleted_at is not null and body = 'Hung my queen'));
select public.undo_action((pg_temp.get('clear')::jsonb->>'action_id')::uuid);
select pg_temp.ok('undoing the clear brings the note back',
  exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and deleted_at is null and body = 'Hung my queen'));
select public.undo_action((pg_temp.get('edit')::jsonb->>'action_id')::uuid);
select pg_temp.ok('undoing the edit restores the text before it',
  exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and body = E'  Hung my queen\non move 12 '));
select public.undo_action((pg_temp.get('add')::jsonb->>'action_id')::uuid);
select pg_temp.ok('undoing the add removes the note',
  exists (select 1 from public.chess_notes where id = pg_temp.get('id')::uuid and deleted_at is not null));

select pg_temp.ok('a blank body can''t be stored directly',
  pg_temp.err($$insert into public.chess_notes (game_url, body) values ('https://www.chess.com/game/live/blank', E' \t')$$) = '23514');
