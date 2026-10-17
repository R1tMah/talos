-- LeetCode: catalog lookup, inferred flag, redo queue, counts (#45-#50, #52, #53, #153).

-- #45 Catalog lookup.
select pg_temp.put('koko', public.log_leetcode(p_date => '2099-05-01', p_title => 'Koko eating bananas', p_minutes => 10)->'row'->>'id');
select pg_temp.ok('#45 "Koko eating bananas" resolves to the catalog: medium, Binary Search, inferred = false',
  exists (select 1 from public.leetcode_log where id = pg_temp.get('koko')::uuid and title = 'Koko Eating Bananas'
          and difficulty = 'medium' and topic = 'Binary Search' and inferred = false and catalog_id is not null),
  (select format('%s | %s | %s | inferred=%s', title, difficulty, topic, inferred) from public.leetcode_log where id = pg_temp.get('koko')::uuid));

-- #46 Not in the catalog: the model's difficulty/topic, marked inferred.
select pg_temp.put('new', public.log_leetcode(p_date => '2099-05-01', p_title => 'ZZ Totally New Problem', p_difficulty => 'hard', p_topic => 'Graphs', p_inferred => true)->'row'->>'id');
select pg_temp.ok('#46 a problem not in the catalog keeps the given difficulty/topic with inferred = true',
  exists (select 1 from public.leetcode_log where id = pg_temp.get('new')::uuid and difficulty = 'hard' and topic = 'Graphs' and inferred and catalog_id is null));

-- #47 Correcting it clears the flag.
select public.update_leetcode(pg_temp.get('new')::uuid, '2099-05-01', 'ZZ Totally New Problem', null, null, null, false, null, 'medium', 'Graphs');
select pg_temp.ok('#47 correcting an inferred row clears the inferred flag',
  exists (select 1 from public.leetcode_log where id = pg_temp.get('new')::uuid and difficulty = 'medium' and not inferred));

-- #48 Redo puts it in the queue; #49 a newer attempt without redo takes it out.
select public.log_leetcode(p_date => '2099-05-02', p_title => 'Two Sum', p_redo => true);
select pg_temp.ok('#48 a redo flag puts the problem in the redo queue',
  exists (select 1 from public.redo_queue where title = 'Two Sum'));
select public.log_leetcode(p_date => '2099-05-03', p_title => 'Two Sum', p_redo => false);
select pg_temp.ok('#49 a newer attempt with redo off removes it from the queue',
  not exists (select 1 from public.redo_queue where title = 'Two Sum'));

-- #50 Oldest first.
select pg_temp.ok('#50 the redo queue is ordered oldest first',
  (select array_agg(logical_date) from (select logical_date from public.redo_queue) q)
  = (select array_agg(logical_date order by logical_date) from public.redo_queue));

-- #52 Notes are saved verbatim.
select pg_temp.put('noted', public.log_leetcode(p_date => '2099-05-04', p_title => 'Two Sum', p_notes => E'  fuck ass problem 😭\n- redo  ')->'row'->>'id');
select pg_temp.ok('#52 notes are saved byte for byte',
  (select notes from public.leetcode_log where id = pg_temp.get('noted')::uuid) = E'  fuck ass problem 😭\n- redo  ');

-- #53 Counts match the rows.
select pg_temp.ok('#53 counts by difficulty match the rows',
  (select jsonb_object_agg(key, n) from public.leetcode_counts('2000-01-01', '2100-01-01') where dimension = 'difficulty')
  = (select jsonb_object_agg(coalesce(difficulty, 'unknown'), c) from (select difficulty, count(*) c from public.leetcode_log where deleted_at is null group by 1) x));
select pg_temp.ok('#53 counts by result match the rows',
  (select jsonb_object_agg(key, n) from public.leetcode_counts('2000-01-01', '2100-01-01') where dimension = 'result')
  = (select jsonb_object_agg(coalesce(result, 'unstated'), c) from (select result, count(*) c from public.leetcode_log where deleted_at is null group by 1) x));
select pg_temp.ok('#53 counts by topic match the rows',
  (select jsonb_object_agg(key, n) from public.leetcode_counts('2000-01-01', '2100-01-01') where dimension = 'topic')
  = (select jsonb_object_agg(coalesce(topic, 'unknown'), c) from (select topic, count(*) c from public.leetcode_log where deleted_at is null group by 1) x));
