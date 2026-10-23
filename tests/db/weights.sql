-- Weight: one per day, conflicts, verbatim notes, constraints (#16-#22).

-- #16 Negative numbers are rejected everywhere (check constraints, SQLSTATE 23514).
select pg_temp.ok('#16 negative weight is rejected',
  pg_temp.err($$insert into public.weights (logical_date, weight_lb) values ('2099-03-01', -5)$$) = '23514');
select pg_temp.ok('#16 negative calories are rejected',
  pg_temp.err($$insert into public.food_log (logical_date, description, calories, protein_g, source) values ('2099-03-01', 'x', -1, 1, 'typed')$$) = '23514');
select pg_temp.ok('#16 negative protein is rejected',
  pg_temp.err($$insert into public.food_log (logical_date, description, calories, protein_g, source) values ('2099-03-01', 'x', 1, -1, 'typed')$$) = '23514');
select pg_temp.ok('#16 negative portions are rejected',
  pg_temp.err($$insert into public.food_log (logical_date, description, calories, protein_g, source, amount) values ('2099-03-01', 'x', 1, 1, 'typed', -1)$$) = '23514');
select pg_temp.ok('#16 negative LeetCode minutes are rejected',
  pg_temp.err($$insert into public.leetcode_log (logical_date, title, minutes) values ('2099-03-01', 'x', -3)$$) = '23514');

-- #17 A first weight for the day creates one row.
select pg_temp.put('w1', public.save_weight('2099-03-02', 170.0)->'row'->>'id');
select pg_temp.ok('#17 a first weight for the day creates one row',
  (select count(*) from public.weights where logical_date = '2099-03-02' and deleted_at is null) = 1);

-- #18 A second weight on the same day asks to update and creates no row.
select pg_temp.put('second', public.save_weight('2099-03-02', 171.0)->>'status');
select pg_temp.ok('#18 a second weight the same day returns conflict ("Update?")', pg_temp.get('second') = 'conflict', pg_temp.get('second'));
select pg_temp.ok('#18 ...and creates no new row',
  (select count(*) from public.weights where logical_date = '2099-03-02' and deleted_at is null) = 1);

-- #19 Confirming the update changes the existing row and logs an action.
select pg_temp.put('upd', public.update_weight(pg_temp.get('w1')::uuid, '2099-03-02', 171.0, null)->>'action_id');
select pg_temp.ok('#19 confirming the update changes the existing row',
  (select weight_lb from public.weights where id = pg_temp.get('w1')::uuid) = 171.0);
select pg_temp.ok('#19 ...and logs an action with before and after',
  exists (select 1 from public.actions where id = pg_temp.get('upd')::uuid and table_name = 'weights'
          and (before->>'weight_lb')::numeric = 170.0 and (after->>'weight_lb')::numeric = 171.0));

-- #20 The unique index blocks a duplicate even when the app logic is bypassed.
select pg_temp.ok('#20 a direct duplicate insert is blocked by the unique index',
  pg_temp.err($$insert into public.weights (logical_date, weight_lb) values ('2099-03-02', 172)$$) = '23505');

-- #21 A soft-deleted weight no longer blocks a new one that day.
select public.delete_weight(pg_temp.get('w1')::uuid);
select pg_temp.ok('#21 after a soft delete, a new weight that day saves',
  public.save_weight('2099-03-02', 169.0)->>'status' = 'saved');

-- #22 The note is saved verbatim and is not part of any average.
select pg_temp.put('noted', public.save_weight('2099-03-03', 168.0, E'  felt flat 😩\n  bloated?  ')->'row'->>'id');
select pg_temp.ok('#22 the weight note is saved byte for byte',
  (select note from public.weights where id = pg_temp.get('noted')::uuid) = E'  felt flat 😩\n  bloated?  ');
select pg_temp.ok('#22 ...and weekly_weights has no note column',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'weekly_weights' and column_name = 'note'));

-- Weight notes: dated free text in the weight log, kept out of Content and Journal.
select pg_temp.put('wn', public.add_note('weight', '2099-03-04', E'  weight as plateaued 😩  ')->'row'->>'id');
select pg_temp.ok('weight notes save byte for byte as their own kind',
  exists (select 1 from public.notes where id = pg_temp.get('wn')::uuid and kind = 'weight' and body = E'  weight as plateaued 😩  '));
select pg_temp.ok('...and never show up as content or journal',
  not exists (select 1 from public.notes where id = pg_temp.get('wn')::uuid and kind in ('content', 'journal')));
select pg_temp.ok('the three imported remarks are there, word for word',
  (select count(*) from public.notes where kind = 'weight' and deleted_at is null and logical_date in ('2026-05-24', '2026-09-27')) = 3
  and exists (select 1 from public.notes where kind = 'weight' and body = 'All weight loss was fat I got stronger since I was 198'));

-- Personal journal entries: their own kind, verbatim, never in the other notepads.
select pg_temp.put('pj', public.add_note('personal', '2099-03-05', E'  rough day 😞\n  called mom  ')->'row'->>'id');
select pg_temp.ok('personal journal entries save byte for byte as their own kind',
  exists (select 1 from public.notes where id = pg_temp.get('pj')::uuid and kind = 'personal' and body = E'  rough day 😞\n  called mom  '));
select pg_temp.ok('the personal journal can be archived like the other notepads',
  pg_temp.err($$update public.settings set archived_tabs = array['personal'] where id = 1$$) is null);

-- Talos improvements: their own kind; the moved entry left the Work Journal.
select pg_temp.ok('Talos improvement notes save as their own kind',
  public.add_note('talos', '2099-03-06', 'dark mode chart colors')->>'status' = 'saved');
select pg_temp.ok('the "add to talos" entry moved out of the Work Journal, word for word',
  exists (select 1 from public.notes where kind = 'talos' and body = 'add to talos: watch tab, any reminders, better ui for the agent' and logical_date = '2026-10-21')
  and not exists (select 1 from public.notes where kind = 'journal' and body like 'add to talos%' and deleted_at is null));
