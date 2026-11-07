-- Learning: an optional "finish by" date per curriculum. The Architect fits the modules
-- into the cadence sessions before it; the Learning screens compare the projected finish
-- (the last unfinished module's date) with it.
alter table public.curriculums add column target_date date;
