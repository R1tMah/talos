-- Nutrition slice.
--
-- A saved meal is one portion with fixed macros (no ingredients, no food library).
-- Logging copies its macros into a single food_log row, multiplied by the number
-- of portions, so later edits to the meal never change past days.
--
-- Same conventions as the weight functions: security invoker (RLS applies),
-- every write also logs an actions row, and each returns jsonb
-- { status: 'saved', row, action_id } | { status: 'conflict', existing } | { status: 'not_found' }.

-- ---- Saved meals: one portion each -------------------------------------------

-- Table is empty, so the required columns need no default.
alter table public.saved_meals
  add column portion_unit text not null default 'serving',  -- 'serving', 'oz', 'scoop', ...
  add column calories int not null check (calories >= 0),
  add column protein_g numeric not null check (protein_g >= 0),
  add column carbs_g numeric check (carbs_g >= 0),
  add column fat_g numeric check (fat_g >= 0);

-- Two live meals already can't share a name (saved_meals_name_unique on lower(name));
-- aliases are resolved, and disambiguated, in code.

-- food_log.amount holds the portion count for saved-meal entries.
alter table public.food_log add constraint food_log_amount_positive check (amount is null or amount > 0);

-- ---- Targets and daily totals ------------------------------------------------

-- Targets for a day: the phase covering it, falling back to Settings per field.
create function public.targets_for(p_date date)
returns table (calorie_target int, protein_target_g int)
language sql
stable
set search_path = ''
as $$
  select coalesce(p.calorie_target, s.calorie_target), coalesce(p.protein_target_g, s.protein_target_g)
  from public.settings s
  left join lateral (
    select ph.calorie_target, ph.protein_target_g
    from public.phases ph
    where ph.deleted_at is null
      and ph.start_date <= p_date
      and (ph.end_date is null or ph.end_date >= p_date)
    order by ph.start_date desc
    limit 1
  ) p on true
  where s.id = 1
$$;

-- One row per logged day only (missing is not zero), newest first.
create view public.daily_totals with (security_invoker = true) as
with d as (
  select logical_date,
         sum(calories)::int as calories,
         round(sum(protein_g), 1) as protein_g,
         round(sum(carbs_g), 1) as carbs_g,
         round(sum(fat_g), 1) as fat_g,
         count(*)::int as entries
  from public.food_log
  where deleted_at is null
  group by logical_date
)
select d.logical_date, d.calories, d.protein_g, d.carbs_g, d.fat_g, d.entries, t.calorie_target, t.protein_target_g
from d
cross join lateral public.targets_for(d.logical_date) t
order by d.logical_date desc;

-- ---- Logging -----------------------------------------------------------------

-- A one-off entry with the macros as given (typed, or a photo estimate the owner confirmed).
create function public.log_food(
  p_date date, p_description text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric default null, p_fat_g numeric default null,
  p_source text default 'typed', p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.food_log;
  v_action uuid;
begin
  if p_source not in ('typed', 'photo_estimate') then
    raise exception 'log_food source must be typed or photo_estimate, got %', p_source;
  end if;

  insert into public.food_log (logical_date, description, calories, protein_g, carbs_g, fat_g, source)
  values (p_date, p_description, p_calories, p_protein_g, p_carbs_g, p_fat_g, p_source)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Copies a saved meal's macros times p_portions into one row.
-- Calories round to whole numbers, grams to one decimal.
create function public.log_saved_meal(p_date date, p_meal_id uuid, p_portions numeric default 1, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_meal public.saved_meals;
  v_row public.food_log;
  v_action uuid;
begin
  select * into v_meal from public.saved_meals where id = p_meal_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.food_log (logical_date, description, saved_meal_name, amount, unit, calories, protein_g, carbs_g, fat_g, source)
  values (
    p_date, v_meal.name, v_meal.name, p_portions, v_meal.portion_unit,
    round(v_meal.calories * p_portions)::int,
    round(v_meal.protein_g * p_portions, 1),
    round(v_meal.carbs_g * p_portions, 1),
    round(v_meal.fat_g * p_portions, 1),
    'saved_meal'
  )
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Editing log entries -----------------------------------------------------

-- Sets the fields as given. Used for typed and estimate entries.
create function public.update_food_entry(
  p_id uuid, p_date date, p_description text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric, p_fat_g numeric, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.food_log;
  v_row public.food_log;
  v_action uuid;
begin
  select * into v_before from public.food_log where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.food_log
  set logical_date = p_date, description = p_description,
      calories = p_calories, protein_g = p_protein_g, carbs_g = p_carbs_g, fat_g = p_fat_g
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Saved-meal entries: change the date and portion count. Macros rescale from the
-- entry's own copied values, not the current meal, so meal edits never leak in.
create function public.set_food_portions(p_id uuid, p_date date, p_portions numeric, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.food_log;
  v_row public.food_log;
  v_action uuid;
  v_k numeric;
begin
  select * into v_before from public.food_log where id = p_id and deleted_at is null and amount is not null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_k := p_portions / v_before.amount;

  update public.food_log
  set logical_date = p_date,
      amount = p_portions,
      calories = round(v_before.calories * v_k)::int,
      protein_g = round(v_before.protein_g * v_k, 1),
      carbs_g = round(v_before.carbs_g * v_k, 1),
      fat_g = round(v_before.fat_g * v_k, 1)
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_food_entry(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.food_log;
  v_row public.food_log;
  v_action uuid;
begin
  select * into v_before from public.food_log where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.food_log set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Saved meals -------------------------------------------------------------

-- A name already used by another live meal returns that meal as a conflict.
create function public.save_meal(
  p_name text, p_aliases text[], p_portion_unit text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric default null, p_fat_g numeric default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.saved_meals;
  v_row public.saved_meals;
  v_action uuid;
begin
  select * into v_existing from public.saved_meals where lower(name) = lower(p_name) and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.saved_meals (name, aliases, portion_unit, calories, protein_g, carbs_g, fat_g)
  values (p_name, coalesce(p_aliases, '{}'), coalesce(p_portion_unit, 'serving'), p_calories, p_protein_g, p_carbs_g, p_fat_g)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meals', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_meal(
  p_id uuid, p_name text, p_aliases text[], p_portion_unit text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric, p_fat_g numeric, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.saved_meals;
  v_existing public.saved_meals;
  v_row public.saved_meals;
  v_action uuid;
begin
  select * into v_before from public.saved_meals where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_existing from public.saved_meals where lower(name) = lower(p_name) and deleted_at is null and id <> p_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  update public.saved_meals
  set name = p_name, aliases = coalesce(p_aliases, '{}'), portion_unit = coalesce(p_portion_unit, 'serving'),
      calories = p_calories, protein_g = p_protein_g, carbs_g = p_carbs_g, fat_g = p_fat_g
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meals', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_meal(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.saved_meals;
  v_row public.saved_meals;
  v_action uuid;
begin
  select * into v_before from public.saved_meals where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.saved_meals set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meals', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Access ------------------------------------------------------------------

grant select on public.daily_totals to authenticated;

revoke execute on function
  public.targets_for(date),
  public.log_food(date, text, int, numeric, numeric, numeric, text, text),
  public.log_saved_meal(date, uuid, numeric, text),
  public.update_food_entry(uuid, date, text, int, numeric, numeric, numeric, text),
  public.set_food_portions(uuid, date, numeric, text),
  public.delete_food_entry(uuid, text),
  public.save_meal(text, text[], text, int, numeric, numeric, numeric, text),
  public.update_meal(uuid, text, text[], text, int, numeric, numeric, numeric, text),
  public.delete_meal(uuid, text)
from public, anon;

grant execute on function
  public.targets_for(date),
  public.log_food(date, text, int, numeric, numeric, numeric, text, text),
  public.log_saved_meal(date, uuid, numeric, text),
  public.update_food_entry(uuid, date, text, int, numeric, numeric, numeric, text),
  public.set_food_portions(uuid, date, numeric, text),
  public.delete_food_entry(uuid, text),
  public.save_meal(text, text[], text, int, numeric, numeric, numeric, text),
  public.update_meal(uuid, text, text[], text, int, numeric, numeric, numeric, text),
  public.delete_meal(uuid, text)
to authenticated;
