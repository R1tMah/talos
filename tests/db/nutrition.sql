-- Nutrition and saved meals (#33-#36, #38, #44).

-- #33 A typed entry saves with source typed.
select pg_temp.put('typed', public.log_food(p_date => '2099-04-01', p_description => 'big dinner', p_calories => 2100, p_protein_g => 150)->'row'->>'id');
select pg_temp.ok('#33 a typed entry saves with source typed',
  (select source from public.food_log where id = pg_temp.get('typed')::uuid) = 'typed');

-- #34 Daily totals add up.
select public.log_food(p_date => '2099-04-03', p_description => 'a', p_calories => 500, p_protein_g => 40, p_carbs_g => 50, p_fat_g => 10);
select public.log_food(p_date => '2099-04-03', p_description => 'b', p_calories => 300, p_protein_g => 20.5, p_carbs_g => null, p_fat_g => 5);
select pg_temp.ok('#34 daily totals sum calories, protein, carbs and fat',
  exists (select 1 from public.daily_totals where logical_date = '2099-04-03'
          and calories = 800 and protein_g = 60.5 and carbs_g = 50 and fat_g = 15 and entries = 2),
  (select format('%s cal %s p %s c %s f', calories, protein_g, carbs_g, fat_g) from public.daily_totals where logical_date = '2099-04-03'));

-- #35 A day with no food has no row.
select pg_temp.ok('#35 a day with no food has no row (not a zero total)',
  not exists (select 1 from public.daily_totals where logical_date = '2099-04-02'));

-- #36 A saved meal logs with its macros copied. (Design: one food_log row per meal,
-- not one per ingredient, so tagged ingredients don't change what's logged.)
select pg_temp.put('meal', public.save_meal('ZZ test breakfast', array['zz weekday breakfast'], 'serving', 400, 30)->'row'->>'id');
select pg_temp.put('logged', public.log_saved_meal(p_date => '2099-04-04', p_meal_id => pg_temp.get('meal')::uuid, p_portions => 1)->'row'->>'id');
select pg_temp.ok('#36 a saved meal logs with its macros copied',
  exists (select 1 from public.food_log where id = pg_temp.get('logged')::uuid
          and calories = 400 and protein_g = 30 and source = 'saved_meal' and saved_meal_name = 'ZZ test breakfast'));

-- #38 Editing the meal afterwards doesn't change past rows.
select public.update_meal(pg_temp.get('meal')::uuid, 'ZZ test breakfast', array['zz weekday breakfast'], 'serving', 550, 45, null, null);
select pg_temp.ok('#38 editing a saved meal does not change past food_log rows',
  (select calories from public.food_log where id = pg_temp.get('logged')::uuid) = 400);

-- #44 The target for a past day comes from the phase covering it, else Settings.
-- Its own phases, so editing real phases or Settings can't break it: the real ones are
-- set aside first (rolled back with the rest), since an open phase would cover 2099.
update public.phases set deleted_at = now() where deleted_at is null;
select public.add_phase('2099-06-01', '2099-06-30', 'ZZ cut', 2250, 175, null);
select public.add_phase('2099-08-01', '2099-08-31', 'ZZ maintain', 2600, null, null);
select pg_temp.ok('#44 a day in a phase uses its calorie and protein targets',
  (select (calorie_target, protein_target_g) = (2250, 175) from public.targets_for('2099-06-15')));
select pg_temp.ok('#44 a day between phases falls back to Settings',
  (select (t.calorie_target, t.protein_target_g) is not distinct from (s.calorie_target, s.protein_target_g)
     from public.targets_for('2099-07-15') t, public.settings s where s.id = 1));
select pg_temp.ok('#44 a phase with no protein target falls back to Settings for protein',
  (select t.calorie_target = 2600 and t.protein_target_g is not distinct from s.protein_target_g
     from public.targets_for('2099-08-15') t, public.settings s where s.id = 1));
