-- Owner's corrections to the Chipotle foods.
-- White rice: the imported numbers are the Light portion, which is what the owner orders.
update public.foods
set serving_unit = 'light portion'
where name = 'Chipotle White Rice' and deleted_at is null;

-- Not ordered: brown rice and every meat except chicken. Soft delete, rows stay.
update public.foods
set deleted_at = now()
where name in ('Chipotle Brown Rice', 'Chipotle Steak', 'Chipotle Beef Barbacoa', 'Chipotle Carnitas')
  and deleted_at is null;

-- Side tortilla: owner gave calories and protein only, so fat and carbs stay unknown (null).
insert into public.foods (name, serving_amount, serving_unit, calories, protein_g, fat_g, carbs_g, source)
select 'Chipotle Side Tortilla', 1, 'serving', 320, 8, null, null, 'typed'
where not exists (
  select 1 from public.foods where name = 'Chipotle Side Tortilla' and deleted_at is null
);
