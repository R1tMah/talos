-- Log a food from the library: its macros times p_servings, copied into one
-- food_log row (later edits to the food never change past days). Same rounding
-- as log_saved_meal. Source stays 'typed'; food_id marks it as a library food,
-- and amount/unit hold the servings so the portions editor works on it.
create function public.log_food_item(p_date date, p_food_id uuid, p_servings numeric default 1, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_food public.foods;
  v_row public.food_log;
  v_action uuid;
begin
  if p_servings is null or p_servings <= 0 then
    raise exception 'p_servings must be more than 0';
  end if;

  select * into v_food from public.foods where id = p_food_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.food_log (logical_date, description, food_id, amount, unit, calories, protein_g, carbs_g, fat_g, source)
  values (
    p_date, v_food.name, v_food.id, p_servings, v_food.serving_unit,
    round(v_food.calories * p_servings)::int,
    round(v_food.protein_g * p_servings, 1),
    round(v_food.carbs_g * p_servings, 1),
    round(v_food.fat_g * p_servings, 1),
    'typed'
  )
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'food_log', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function public.log_food_item(date, uuid, numeric, text) from public, anon;
grant execute on function public.log_food_item(date, uuid, numeric, text) to authenticated;
