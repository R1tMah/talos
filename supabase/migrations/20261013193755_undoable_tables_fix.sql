-- Fix: 20261013191216_application_reminders redefined undoable_table from an older
-- copy and dropped workouts, sets and exercises (added in 20261012015650_workouts),
-- so Undo was refused for workout rows. This is the full list.
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders'])
$$;
