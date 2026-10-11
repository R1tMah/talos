-- Make the Chipotle meals easy for the chat agent to match exactly.

-- 1. Natural ways the owner refers to the protein bowl (existing aliases kept).
update public.saved_meals
set aliases = array(
  select distinct a from unnest(aliases || array['protein maximized bowl', 'protein max bowl', 'protein bowl']) as a
)
where name = 'Protein Maximized Chipotle Bowl' and deleted_at is null;

-- 2. "chipotle" alone is too broad: it could match the protein bowl too.
update public.saved_meals
set aliases = array_remove(aliases, 'chipotle')
where name = 'Chipotle Bowl' and deleted_at is null;

-- 3. Side tortilla as a one-item saved meal, so "bowl with a tortilla on the side"
--    is two saved meals logged together. Same numbers as the Chipotle Side Tortilla food.
insert into public.saved_meals (name, aliases, portion_unit, calories, protein_g)
select 'Chipotle Side Tortilla', array['side tortilla', 'tortilla', 'tortilla on the side'], 'tortilla', 320, 8
where not exists (
  select 1 from public.saved_meals where lower(name) = 'chipotle side tortilla' and deleted_at is null
);

insert into public.saved_meal_items (saved_meal_id, food_id, servings)
select m.id, f.id, 1
from public.saved_meals m
join public.foods f on f.name = 'Chipotle Side Tortilla' and f.deleted_at is null
where m.name = 'Chipotle Side Tortilla' and m.deleted_at is null
  and not exists (select 1 from public.saved_meal_items i where i.saved_meal_id = m.id and i.deleted_at is null);
