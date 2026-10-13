-- The owner calls Chipotle's fresh tomato salsa "pico"; the chat agent matches on aliases.
update public.foods
set aliases = array(select distinct a from unnest(aliases || array['pico', 'pico de gallo']) as a)
where name = 'Chipotle Fresh Tomato Salsa' and deleted_at is null;
