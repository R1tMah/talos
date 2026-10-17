-- LeetCode fixes from the owner's real messages (message_log, Oct 14-17).

-- 1. "Solved" / "completed" / "done" is its own result. Mapping it to "optimal" claimed
--    more than the owner said; leaving it empty dropped what they did say.
alter table public.leetcode_log drop constraint if exists leetcode_log_result_check;
alter table public.leetcode_log add constraint leetcode_log_result_check
  check (result = any (array['solved', 'optimal', 'suboptimal', 'failed']));

-- 2. Remember how the owner names a problem. When chat asks "Did you mean Reorder List?"
--    and the owner picks it, their wording ("reorder linked list") becomes an alias, so
--    lc_lookup matches it exactly next time.
create function public.lc_add_alias(p_title text, p_alias text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_alias text := lower(btrim(p_alias));
  v_row public.lc_catalog;
begin
  if v_alias = '' then
    return jsonb_build_object('status', 'unchanged');
  end if;
  update public.lc_catalog
  set aliases = array(select distinct a from unnest(aliases || v_alias) as a order by a)
  where title = p_title and lower(title) <> v_alias and not (v_alias = any (aliases))
  returning * into v_row;
  return jsonb_build_object('status', case when found then 'saved' else 'unchanged' end);
end;
$$;

revoke execute on function public.lc_add_alias(text, text) from public, anon;
grant execute on function public.lc_add_alias(text, text) to authenticated;
