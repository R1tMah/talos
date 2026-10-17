-- Workouts (#16 sets, #69, #70, #76, #82-#84).

-- Set aside any real active workout for this (rolled-back) transaction.
update public.workouts set deleted_at = now() where status = 'active' and deleted_at is null;

-- #69 Starting a plan creates one active workout with started_at.
select pg_temp.put('w', public.start_workout((select id from public.plans where name = 'Push'), '2099-07-01')->'row'->>'id');
select pg_temp.ok('#69 starting a plan creates one active workout with started_at',
  (select count(*) from public.workouts where status = 'active' and deleted_at is null) = 1
  and (select started_at is not null and plan_id = (select id from public.plans where name = 'Push') from public.workouts where id = pg_temp.get('w')::uuid));

-- #70 A second active workout is blocked by the database itself.
select pg_temp.ok('#70 a second active workout is blocked by the one_active_workout index',
  pg_temp.err($$insert into public.workouts (logical_date, started_at, status) values ('2099-07-01', now(), 'active')$$) = '23505');
select pg_temp.ok('#70 ...and start_workout returns the active one instead',
  public.start_workout(null, '2099-07-01')->>'status' = 'conflict');

-- #16 Negative or zero set values are rejected.
select pg_temp.ok('#16 a negative set weight is rejected',
  pg_temp.err(format($$select public.log_set('%s', (select id from public.exercises where name = 'Shoulder press'), 8, -10)$$, pg_temp.get('w'))) = '23514');
select pg_temp.ok('#16 zero reps are rejected',
  pg_temp.err(format($$select public.log_set('%s', (select id from public.exercises where name = 'Shoulder press'), 0, 50)$$, pg_temp.get('w'))) = '23514');

-- #76 An exercise outside the plan still logs.
select pg_temp.ok('#76 an exercise not in the plan (Hack squat on Push) still logs',
  public.log_set(pg_temp.get('w')::uuid, (select id from public.exercises where name = 'Hack squat'), 8, 180)->>'status' = 'saved');
select pg_temp.ok('#72 (database part) set numbers count up per exercise',
  (public.log_set(pg_temp.get('w')::uuid, (select id from public.exercises where name = 'Hack squat'), 8, 180)->'row'->>'set_number')::int = 2);

-- #82 Done sets ended_at and status done.
select public.update_workout(pg_temp.get('w')::uuid, '2099-07-01', now() - interval '50 minutes', now(), 'done');
select pg_temp.ok('#82 Done sets ended_at and status done',
  exists (select 1 from public.workouts where id = pg_temp.get('w')::uuid and status = 'done' and ended_at is not null));
select pg_temp.ok('#82 ...and the summary is counts only (sets, minutes)',
  exists (select 1 from public.workout_history where id = pg_temp.get('w')::uuid and sets = 2 and minutes = 50));

-- #83 Editing the end time updates the duration.
select public.update_workout(pg_temp.get('w')::uuid, '2099-07-01', now() - interval '50 minutes', now() - interval '20 minutes', 'done');
select pg_temp.ok('#83 editing the end time afterwards updates the duration',
  (select minutes from public.workout_history where id = pg_temp.get('w')::uuid) = 30);

-- #84 A workout left open for hours stays active.
select pg_temp.put('long', public.start_workout(null, '2099-07-02')->'row'->>'id');
select public.update_workout(pg_temp.get('long')::uuid, '2099-07-02', now() - interval '9 hours', null, 'active');
select pg_temp.ok('#84 a workout open for 9 hours is still active (no auto-close)',
  (select status from public.workouts where id = pg_temp.get('long')::uuid) = 'active');
