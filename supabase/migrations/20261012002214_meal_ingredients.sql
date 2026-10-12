-- Food library and saved-meal ingredients.
--
-- A saved meal's own calories/protein stay the official numbers. Ingredients are
-- optional tags (saved_meal_items) that show what a meal is made of and let a
-- single log subtract some of it ("bowl without sour cream"). Editing ingredients
-- never rewrites a meal's totals, and past log rows are never touched.
--
-- Same conventions as the other slices: security invoker, actions row per write,
-- jsonb { status, row, action_id } results.

-- ---- Undo can now revert foods -----------------------------------------------------
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes', 'applications', 'foods'])
$$;

-- ---- Foods -------------------------------------------------------------------------

-- A name already used by another live food returns that food as a conflict.
create function public.save_food(
  p_name text, p_serving_amount numeric, p_serving_unit text, p_calories int, p_protein_g numeric,
  p_aliases text[] default '{}', p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.foods;
  v_row public.foods;
  v_action uuid;
begin
  select * into v_existing from public.foods where lower(name) = lower(p_name) and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.foods (name, aliases, serving_amount, serving_unit, calories, protein_g, source)
  values (p_name, coalesce(p_aliases, '{}'), p_serving_amount, p_serving_unit, p_calories, p_protein_g, 'typed')
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'foods', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Carbs and fat aren't edited in the app; whatever is stored stays as it is.
create function public.update_food(
  p_id uuid, p_name text, p_serving_amount numeric, p_serving_unit text, p_calories int, p_protein_g numeric,
  p_aliases text[], p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.foods;
  v_existing public.foods;
  v_row public.foods;
  v_action uuid;
begin
  select * into v_before from public.foods where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_existing from public.foods where lower(name) = lower(p_name) and deleted_at is null and id <> p_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  update public.foods
  set name = p_name, aliases = coalesce(p_aliases, '{}'), serving_amount = p_serving_amount,
      serving_unit = p_serving_unit, calories = p_calories, protein_g = p_protein_g
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'foods', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft delete. Refused while a live saved meal lists the food as an ingredient,
-- so a meal never points at a missing food: { status: 'in_use', meals: [names] }.
create function public.delete_food(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.foods;
  v_row public.foods;
  v_meals jsonb;
  v_action uuid;
begin
  select * into v_before from public.foods where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select jsonb_agg(distinct m.name) into v_meals
  from public.saved_meal_items i
  join public.saved_meals m on m.id = i.saved_meal_id and m.deleted_at is null
  where i.food_id = p_id and i.deleted_at is null;
  if v_meals is not null then
    return jsonb_build_object('status', 'in_use', 'meals', v_meals);
  end if;

  update public.foods set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'foods', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Meal ingredients --------------------------------------------------------------

-- Replaces a meal's ingredient list with p_items = [{ "food_id": uuid, "servings": n }, ...].
-- An empty list clears it. Old items are soft-deleted. The change is recorded in
-- actions with no row_id (it spans several rows), so it isn't picked up by undo.
create function public.set_meal_items(p_meal_id uuid, p_items jsonb, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_meal public.saved_meals;
  v_before jsonb;
  v_after jsonb;
  v_action uuid;
begin
  select * into v_meal from public.saved_meals where id = p_meal_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e->>'servings')::numeric is null or (e->>'servings')::numeric <= 0
       or not exists (select 1 from public.foods f where f.id = (e->>'food_id')::uuid and f.deleted_at is null)
  ) then
    raise exception 'each item needs a live food_id and servings > 0';
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct e->>'food_id') from jsonb_array_elements(p_items) e) then
    raise exception 'a food can only be listed once per meal';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('food_id', food_id, 'servings', servings) order by created_at), '[]')
  into v_before from public.saved_meal_items where saved_meal_id = p_meal_id and deleted_at is null;

  update public.saved_meal_items set deleted_at = now() where saved_meal_id = p_meal_id and deleted_at is null;

  insert into public.saved_meal_items (saved_meal_id, food_id, servings)
  select p_meal_id, (e->>'food_id')::uuid, (e->>'servings')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(e, n)
  order by n;

  select coalesce(jsonb_agg(jsonb_build_object('food_id', food_id, 'servings', servings) order by created_at), '[]')
  into v_after from public.saved_meal_items where saved_meal_id = p_meal_id and deleted_at is null;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meal_items', null,
          jsonb_build_object('meal_id', p_meal_id, 'items', v_before),
          jsonb_build_object('meal_id', p_meal_id, 'items', v_after))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_meal), 'action_id', null);
end;
$$;

-- ---- Logging a saved meal, optionally minus some of it -------------------------------

-- p_minus = [{ "food_id": uuid, "servings": n }, ...]: servings of the meal's own
-- ingredients to leave out of this one log (per portion). The row gets the meal's
-- macros minus those foods' macros, times p_portions, and a description that names
-- what was left out. Calories round to whole numbers, grams to one decimal, floor 0.
drop function public.log_saved_meal(date, uuid, numeric, text);

create function public.log_saved_meal(
  p_date date, p_meal_id uuid, p_portions numeric default 1, p_tool text default 'manual',
  p_minus jsonb default '[]'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_meal public.saved_meals;
  v_row public.food_log;
  v_action uuid;
  v_cal numeric := 0;
  v_p numeric := 0;
  v_c numeric := 0;
  v_f numeric := 0;
  v_desc text;
  v_left text;
begin
  select * into v_meal from public.saved_meals where id = p_meal_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if jsonb_typeof(coalesce(p_minus, '[]')) <> 'array' then
    raise exception 'p_minus must be a json array';
  end if;

  -- Every subtracted food must be one of this meal's ingredients, by no more than it has.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_minus, '[]')) e
    left join public.saved_meal_items i
      on i.saved_meal_id = p_meal_id and i.deleted_at is null and i.food_id = (e->>'food_id')::uuid
    where i.id is null or (e->>'servings')::numeric is null
       or (e->>'servings')::numeric <= 0 or (e->>'servings')::numeric > i.servings
  ) then
    raise exception 'p_minus can only remove servings of this meal''s ingredients';
  end if;

  select coalesce(sum(f.calories * m.s), 0), coalesce(sum(f.protein_g * m.s), 0),
         coalesce(sum(coalesce(f.carbs_g, 0) * m.s), 0), coalesce(sum(coalesce(f.fat_g, 0) * m.s), 0),
         string_agg(case when m.s = i.servings then f.name else format('%s of %s %s', m.s, i.servings, f.name) end, ', ' order by i.created_at)
  into v_cal, v_p, v_c, v_f, v_left
  from (select (e->>'food_id')::uuid as food_id, (e->>'servings')::numeric as s from jsonb_array_elements(coalesce(p_minus, '[]')) e) m
  join public.saved_meal_items i on i.saved_meal_id = p_meal_id and i.deleted_at is null and i.food_id = m.food_id
  join public.foods f on f.id = m.food_id;

  v_desc := case when v_left is null then v_meal.name else v_meal.name || ' without ' || v_left end;

  insert into public.food_log (logical_date, description, saved_meal_name, amount, unit, calories, protein_g, carbs_g, fat_g, source)
  values (
    p_date, v_desc, v_meal.name, p_portions, v_meal.portion_unit,
    greatest(round((v_meal.calories - v_cal) * p_portions), 0)::int,
    greatest(round((v_meal.protein_g - v_p) * p_portions, 1), 0),
    greatest(round((v_meal.carbs_g - v_c) * p_portions, 1), 0),
    greatest(round((v_meal.fat_g - v_f) * p_portions, 1), 0),
    'saved_meal'
  )
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Access ----------------------------------------------------------------------------
revoke execute on function
  public.save_food(text, numeric, text, int, numeric, text[], text),
  public.update_food(uuid, text, numeric, text, int, numeric, text[], text),
  public.delete_food(uuid, text),
  public.set_meal_items(uuid, jsonb, text),
  public.log_saved_meal(date, uuid, numeric, text, jsonb)
from public, anon;

grant execute on function
  public.save_food(text, numeric, text, int, numeric, text[], text),
  public.update_food(uuid, text, numeric, text, int, numeric, text[], text),
  public.delete_food(uuid, text),
  public.set_meal_items(uuid, jsonb, text),
  public.log_saved_meal(date, uuid, numeric, text, jsonb)
to authenticated;
