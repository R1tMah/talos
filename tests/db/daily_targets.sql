-- Each day keeps its own targets: changing targets doesn't rewrite days before today.
-- 2001 dates stand in for past days (no phase covers them, so they use Settings),
-- 2099 dates for future ones.

select set_config('t.today', public.owner_today()::text, true);
select set_config('t.cal', (select calorie_target from public.settings where id = 1)::text, true);
select set_config('t.p', (select protein_target_g from public.settings where id = 1)::text, true);

-- Logging food stores the day's targets.
select public.log_food(p_date => '2001-01-01', p_description => 'zz past', p_calories => 500, p_protein_g => 40);
select public.log_food(p_date => '2099-05-01', p_description => 'zz future', p_calories => 500, p_protein_g => 40);
select pg_temp.ok('logging food stores the day''s targets',
  exists (select 1 from public.daily_targets where logical_date = '2001-01-01'
          and calorie_target = current_setting('t.cal')::int and protein_target_g = current_setting('t.p')::int));

-- Changing targets in Settings leaves past days alone and applies from today.
select public.set_targets(current_setting('t.today')::date, 1234, 111);
select pg_temp.ok('a target change leaves a past logged day as it was',
  (select calorie_target = current_setting('t.cal')::int and protein_target_g = current_setting('t.p')::int
   from public.targets_for('2001-01-01')),
  (select format('%s / %s', calorie_target, protein_target_g) from public.targets_for('2001-01-01')));
select pg_temp.ok('a target change applies to today',
  (select calorie_target = 1234 and protein_target_g = 111 from public.targets_for(current_setting('t.today')::date)));
select pg_temp.ok('a target change re-stores a logged day after today',
  exists (select 1 from public.daily_targets where logical_date = '2099-05-01' and calorie_target = 1234 and protein_target_g = 111));
select pg_temp.ok('daily_totals shows a past day''s own target',
  (select calorie_target from public.daily_totals where logical_date = '2001-01-01') = current_setting('t.cal')::int);

-- A second entry on a stored day doesn't change its targets.
select public.log_food(p_date => '2001-01-01', p_description => 'zz past 2', p_calories => 100, p_protein_g => 5);
select pg_temp.ok('more food on a stored day keeps its targets',
  (select calorie_target from public.targets_for('2001-01-01')) = current_setting('t.cal')::int);

-- A phase added over past dates doesn't change logged days there either.
select public.add_phase('2001-01-01', '2001-01-31', 'zz old', 3000, 200, null);
select pg_temp.ok('a phase over past dates leaves logged days as they were',
  (select calorie_target from public.targets_for('2001-01-01')) = current_setting('t.cal')::int);
select pg_temp.ok('a past day with no food follows the live rule',
  (select calorie_target from public.targets_for('2001-01-02')) = 3000);

-- Backfill: days between phases got the Settings value from before the 11/22 change.
select pg_temp.ok('backfill: 11/01 keeps 2100 / 150 from before the 11/22 change',
  (select calorie_target = 2100 and protein_target_g = 150 from public.daily_targets where logical_date = '2026-11-01'),
  (select format('%s / %s', calorie_target, protein_target_g) from public.daily_targets where logical_date = '2026-11-01'));
