-- Lifts from Liftoff: an import saves every set; the same session pasted again replaces it.

select pg_temp.put('a', public.import_liftoff('[
  {"date":"2099-11-03","started":"2099-11-03 18:22:10","duration":"1h 5m","workout":"Push","exercise":"Incline Dumbbell Bench Press","order":1,"weight":65,"reps":10,"distance":null,"seconds":null,"rpe":8,"notes":null},
  {"date":"2099-11-03","started":"2099-11-03 18:22:10","duration":"1h 5m","workout":"Push","exercise":"Incline Dumbbell Bench Press","order":2,"weight":70,"reps":8,"distance":null,"seconds":null,"rpe":9,"notes":"felt strong, PR"},
  {"date":"2099-11-04","started":"2099-11-04 17:00:00","duration":"58m","workout":"Pull","exercise":"Hammer Curl","order":1,"weight":40,"reps":8,"distance":null,"seconds":null,"rpe":null,"notes":null}
]'::jsonb)::text);
select pg_temp.ok('an import saves every set and counts its workouts',
  (pg_temp.get('a'))::jsonb->>'status' = 'saved' and ((pg_temp.get('a'))::jsonb->>'sets')::int = 3 and ((pg_temp.get('a'))::jsonb->>'sessions')::int = 2
  and (select count(*) from public.workout_log where started like '2099-%' and deleted_at is null) = 3);
select pg_temp.ok('notes and numbers are saved exactly',
  exists (select 1 from public.workout_log where started = '2099-11-03 18:22:10' and set_order = 2 and weight = 70 and reps = 8 and rpe = 9 and notes = 'felt strong, PR'));

-- The same Push session again (an overlapping export, one set changed), plus a new one.
select pg_temp.put('b', public.import_liftoff('[
  {"date":"2099-11-03","started":"2099-11-03 18:22:10","duration":"1h 5m","workout":"Push","exercise":"Incline Dumbbell Bench Press","order":1,"weight":65,"reps":10,"distance":null,"seconds":null,"rpe":8,"notes":null},
  {"date":"2099-11-03","started":"2099-11-03 18:22:10","duration":"1h 5m","workout":"Push","exercise":"Incline Dumbbell Bench Press","order":2,"weight":75,"reps":6,"distance":null,"seconds":null,"rpe":9,"notes":null},
  {"date":"2099-11-06","started":"2099-11-06 07:00:00","duration":"1h","workout":"Legs","exercise":"Hack Squat","order":1,"weight":180,"reps":8,"distance":null,"seconds":null,"rpe":null,"notes":null}
]'::jsonb)::text);
select pg_temp.ok('pasting a session again replaces it instead of adding duplicates',
  ((pg_temp.get('b'))::jsonb->>'replaced')::int = 1
  and (select count(*) from public.workout_log where started = '2099-11-03 18:22:10' and deleted_at is null) = 2
  and exists (select 1 from public.workout_log where started = '2099-11-03 18:22:10' and set_order = 2 and weight = 75 and deleted_at is null));
select pg_temp.ok('sessions not in the new paste are left alone',
  (select count(*) from public.workout_log where started = '2099-11-04 17:00:00' and deleted_at is null) = 1);
select pg_temp.ok('an empty import is refused',
  (public.import_liftoff('[]'::jsonb)->>'status') = 'invalid');
