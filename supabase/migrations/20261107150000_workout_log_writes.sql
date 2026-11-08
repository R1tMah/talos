-- Fix: workout_log was created read-only for the owner (select only), so import_liftoff,
-- which runs as the signed-in owner like every other write, couldn't insert or replace sets.
-- Same grants as the other tables the app writes to (e.g. spending). RLS still limits it to the owner.
grant insert, update on public.workout_log to authenticated;
