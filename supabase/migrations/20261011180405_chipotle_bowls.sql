-- The owner's three Chipotle bowls as saved meals, built from the Chipotle foods.
-- "Less rice" = Chipotle White Rice (light portion), "pico" = Fresh Tomato Salsa,
-- "fajitas" = Fajita Veggies, "beans" = Black Beans.
-- Totals are calories and protein only (carbs and fat aren't tracked for meals).
--
--   1. Protein Maximized Chipotle Bowl (already saved by the owner, 885 cal / 89 g):
--      rice, 2x chicken, 2x beans, fajitas, pico, cheese, lettuce
--   2. Chipotle Bowl (915 cal / 53 g):
--      rice, chicken, beans, fajitas, pico, guac, sour cream, cheese, lettuce
--   3. Low-Calorie Chipotle Bowl (575 cal / 49 g):
--      rice, chicken, beans, fajitas, pico, cheese, lettuce

insert into public.saved_meals (name, aliases, portion_unit, calories, protein_g)
select v.name, v.aliases, 'bowl', v.calories, v.protein_g
from (values
  ('Chipotle Bowl', array['chipotle bowl', 'chipotle'], 915, 53),
  ('Low-Calorie Chipotle Bowl', array['low cal chipotle bowl', 'low calorie chipotle bowl', 'light chipotle bowl'], 575, 49)
) as v(name, aliases, calories, protein_g)
where not exists (
  select 1 from public.saved_meals m where lower(m.name) = lower(v.name) and m.deleted_at is null
);

-- Ingredient breakdown for all three (servings of each food).
insert into public.saved_meal_items (saved_meal_id, food_id, servings)
select m.id, f.id, v.servings
from (values
  ('Protein Maximized Chipotle Bowl', 'Chipotle White Rice', 1),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Chicken', 2),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Black Beans', 2),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Fajita Veggies', 1),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Fresh Tomato Salsa', 1),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Cheese', 1),
  ('Protein Maximized Chipotle Bowl', 'Chipotle Romaine Lettuce', 1),

  ('Chipotle Bowl', 'Chipotle White Rice', 1),
  ('Chipotle Bowl', 'Chipotle Chicken', 1),
  ('Chipotle Bowl', 'Chipotle Black Beans', 1),
  ('Chipotle Bowl', 'Chipotle Fajita Veggies', 1),
  ('Chipotle Bowl', 'Chipotle Fresh Tomato Salsa', 1),
  ('Chipotle Bowl', 'Chipotle Guacamole', 1),
  ('Chipotle Bowl', 'Chipotle Sour Cream', 1),
  ('Chipotle Bowl', 'Chipotle Cheese', 1),
  ('Chipotle Bowl', 'Chipotle Romaine Lettuce', 1),

  ('Low-Calorie Chipotle Bowl', 'Chipotle White Rice', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Chicken', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Black Beans', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Fajita Veggies', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Fresh Tomato Salsa', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Cheese', 1),
  ('Low-Calorie Chipotle Bowl', 'Chipotle Romaine Lettuce', 1)
) as v(meal, food, servings)
join public.saved_meals m on m.name = v.meal and m.deleted_at is null
join public.foods f on f.name = v.food and f.deleted_at is null
where not exists (
  select 1 from public.saved_meal_items i
  where i.saved_meal_id = m.id and i.food_id = f.id and i.deleted_at is null
);
