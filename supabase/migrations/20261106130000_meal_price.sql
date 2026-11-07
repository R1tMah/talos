-- Saved meals can carry a price. Logging a priced meal also logs a 'Food & drink'
-- spending entry (price × portions, same day), linked to the food_log row by
-- spending.food_log_id. The link keeps the two in step: deleting or undoing the meal
-- entry removes its spending, restoring it brings the spending back, and changing the
-- portions or day changes the spending to match. The spending entry stays editable
-- on its own in Finances.

alter table public.saved_meals add column price numeric(10, 2) check (price is null or price > 0);

alter table public.spending add column food_log_id uuid references public.food_log(id);
create index spending_food_log_idx on public.spending (food_log_id) where food_log_id is not null;

-- ---- Saving and editing a meal's price -----------------------------------------------

drop function public.save_meal(text, text[], text, int, numeric, numeric, numeric, text);

create function public.save_meal(
  p_name text, p_aliases text[], p_portion_unit text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric default null, p_fat_g numeric default null, p_tool text default 'manual',
  p_price numeric default null
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

  insert into public.saved_meals (name, aliases, portion_unit, calories, protein_g, carbs_g, fat_g, price)
  values (p_name, coalesce(p_aliases, '{}'), coalesce(p_portion_unit, 'serving'), p_calories, p_protein_g, p_carbs_g, p_fat_g, p_price)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meals', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- p_price left out (NaN) keeps the meal's price, so callers that don't deal in prices
-- (chat edits, alias adds) never clear it. Null clears it.
drop function public.update_meal(uuid, text, text[], text, int, numeric, numeric, numeric, text);

create function public.update_meal(
  p_id uuid, p_name text, p_aliases text[], p_portion_unit text, p_calories int, p_protein_g numeric,
  p_carbs_g numeric, p_fat_g numeric, p_tool text default 'manual', p_price numeric default 'NaN'
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
      calories = p_calories, protein_g = p_protein_g, carbs_g = p_carbs_g, fat_g = p_fat_g,
      price = case when p_price = 'NaN' then v_before.price else p_price end
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_meals', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Logging a priced meal also logs its spending -------------------------------------

-- Same as 20261012002214_meal_ingredients, plus: when the meal has a price and p_spend
-- is true, a spending row for price × portions (its own actions row). The result adds
-- 'spending' and 'spending_action_id' (null when nothing was spent). Chat passes
-- p_spend = false when the owner typed an amount, which log_spending records instead.
drop function public.log_saved_meal(date, uuid, numeric, text, jsonb);

create function public.log_saved_meal(
  p_date date, p_meal_id uuid, p_portions numeric default 1, p_tool text default 'manual',
  p_minus jsonb default '[]', p_spend boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_meal public.saved_meals;
  v_row public.food_log;
  v_action uuid;
  v_spend public.spending;
  v_spend_action uuid;
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

  if coalesce(p_spend, true) and v_meal.price is not null then
    insert into public.spending (logical_date, amount, what, category, food_log_id)
    values (p_date, greatest(round(v_meal.price * p_portions, 2), 0.01), v_meal.name, 'Food & drink', v_row.id)
    returning * into v_spend;

    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'spending', v_spend.id, null, to_jsonb(v_spend))
    returning id into v_spend_action;
  end if;

  return jsonb_build_object(
    'status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action,
    'spending', case when v_spend.id is null then null else to_jsonb(v_spend) end,
    'spending_action_id', v_spend_action
  );
end;
$$;

-- ---- Keeping a meal's spending in step with its food_log row ---------------------------

-- Fires on every food_log update, whether from an edit, a delete, or undo/redo.
-- Deleting the entry deletes its live spending with the same timestamp, so restoring
-- the entry brings back exactly those rows (not spending deleted separately). New
-- portions scale the amount; a new day moves it.
create function public.food_log_sync_spending()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.spending set deleted_at = new.deleted_at where food_log_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.spending set deleted_at = null where food_log_id = new.id and deleted_at = old.deleted_at;
  end if;

  if new.deleted_at is null and old.amount is not null and old.amount > 0 and new.amount is not null
     and new.amount is distinct from old.amount then
    update public.spending set amount = greatest(round(amount * new.amount / old.amount, 2), 0.01)
    where food_log_id = new.id and deleted_at is null;
  end if;

  if new.deleted_at is null and new.logical_date is distinct from old.logical_date then
    update public.spending set logical_date = new.logical_date where food_log_id = new.id and deleted_at is null;
  end if;

  return null;
end;
$$;

create trigger food_log_sync_spending
after update on public.food_log
for each row execute function public.food_log_sync_spending();

-- ---- Access --------------------------------------------------------------------------
revoke execute on function
  public.save_meal(text, text[], text, int, numeric, numeric, numeric, text, numeric),
  public.update_meal(uuid, text, text[], text, int, numeric, numeric, numeric, text, numeric),
  public.log_saved_meal(date, uuid, numeric, text, jsonb, boolean),
  public.food_log_sync_spending()
from public, anon;

grant execute on function
  public.save_meal(text, text[], text, int, numeric, numeric, numeric, text, numeric),
  public.update_meal(uuid, text, text[], text, int, numeric, numeric, numeric, text, numeric),
  public.log_saved_meal(date, uuid, numeric, text, jsonb, boolean)
to authenticated;
