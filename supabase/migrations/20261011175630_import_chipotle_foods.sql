-- Chipotle ingredients, one "Normal" portion each, from the owner's paste of
-- Chipotle's nutrition page. Values as given (calories, fat, protein, carbs).
-- Skipped: "Veggie", "No Rice", "No Beans" (0-calorie menu choices, not foods).
-- Names that already exist (not deleted) are left alone, so re-running is safe.

insert into public.foods (name, serving_amount, serving_unit, calories, fat_g, protein_g, carbs_g, source)
select v.name, 1, 'serving', v.calories, v.fat_g, v.protein_g, v.carbs_g, 'typed'
from (values
  ('Chipotle Chicken',                     180,  7, 32,  0),
  ('Chipotle Steak',                       150,  6, 21,  1),
  ('Chipotle Beef Barbacoa',               170,  7, 24,  2),
  ('Chipotle Carnitas',                    210, 12, 23,  0),
  ('Chipotle Sofritas',                    150, 10,  8,  9),
  ('Chipotle White Rice',                  105,  2,  2, 20),
  ('Chipotle Brown Rice',                  210,  6,  4, 36),
  ('Chipotle Black Beans',                 130,  2,  8, 22),
  ('Chipotle Pinto Beans',                 130,  2,  8, 21),
  ('Chipotle Guacamole',                   230, 22,  2,  8),
  ('Chipotle Fresh Tomato Salsa',           25,  0,  0,  4),
  ('Chipotle Roasted Chili-Corn Salsa',     80,  2,  3, 16),
  ('Chipotle Tomatillo-Green Chili Salsa',  15,  0,  0,  4),
  ('Chipotle Tomatillo-Red Chili Salsa',    30,  0,  0,  4),
  ('Chipotle Sour Cream',                  110,  9,  2,  2),
  ('Chipotle Fajita Veggies',               20,  0,  1,  5),
  ('Chipotle Cheese',                      110,  8,  6,  1),
  ('Chipotle Romaine Lettuce',               5,  0,  0,  1),
  ('Chipotle Queso Blanco',                120,  9,  5,  4)
) as v(name, calories, fat_g, protein_g, carbs_g)
where not exists (
  select 1 from public.foods f where f.name = v.name and f.deleted_at is null
);
