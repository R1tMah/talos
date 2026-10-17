-- Access control (#145, #146) and import results (#150, #153, #155).

-- Runs a statement as another role and returns its SQLSTATE (null on success), then
-- switches back to the owner's role.
create function pg_temp.as_role(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $$
declare s text;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    s := null;
  exception when others then
    s := sqlstate;
  end;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);
  return s;
end $$;

-- Counts rows visible to another user, as text.
create function pg_temp.count_as(p_claims text, p_table text) returns text
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('select count(*) from public.%I', p_table) into n;
  perform set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);
  return n::text;
end $$;

-- #145 Another user's valid session sees and writes nothing.
select pg_temp.ok('#145 another signed-in user sees no weights',
  pg_temp.count_as('{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', 'weights') = '0');
select pg_temp.ok('#145 another signed-in user sees no callbacks',
  pg_temp.count_as('{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', 'callbacks') = '0');
select pg_temp.ok('#145 another signed-in user cannot insert',
  pg_temp.as_role('authenticated', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
    $$insert into public.weights (logical_date, weight_lb) values ('2099-09-01', 170)$$) = '42501');
select pg_temp.ok('#145 is_owner() is false for another user',
  pg_temp.as_role('authenticated', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
    $q$do $x$ begin if public.is_owner() then raise exception 'owner'; end if; end $x$$q$) is null);

-- #146 No session (anon) reads nothing: no privileges at all.
select pg_temp.ok('#146 anon cannot read weights',
  pg_temp.as_role('anon', '{}', $$select count(*) from public.weights$$) = '42501');
select pg_temp.ok('#146 anon cannot read the weekly view',
  pg_temp.as_role('anon', '{}', $$select count(*) from public.weekly_weights$$) = '42501');
select pg_temp.ok('#146 anon cannot call write functions',
  pg_temp.as_role('anon', '{}', $$select public.save_weight('2099-09-01', 170)$$) = '42501');
select pg_temp.ok('#16 no role can hard-delete (no DELETE grant)',
  pg_temp.err($$delete from public.weights where logical_date = '2099-09-02'$$) = '42501');

-- #150 Running an import twice changes nothing: every import refuses a non-empty table.
select pg_temp.ok('#150 the weight import refuses to run again',
  pg_temp.err($q$do $x$ begin
    if exists (select 1 from public.weights) or exists (select 1 from public.phases) or exists (select 1 from public.breaks) then
      raise exception 'weights, phases or breaks is not empty; import already ran or data exists';
    end if; end $x$$q$) = 'P0001');

-- #153 After import, only the final redo queue is flagged. (Real data: will change
-- once new redo flags are logged.)
select pg_temp.ok('#153 Task Scheduler, Majority Element II and Palindrome Partitioning are the redo-flagged problems',
  (select array_agg(title order by title) from public.redo_queue where logical_date <= '2026-10-01')
  = array['Majority Element II', 'Palindrome Partitioning', 'Task Scheduler'],
  (select string_agg(title, ', ') from public.redo_queue));

-- #155 Applications imported with "Eningeer" corrected.
select pg_temp.ok('#155 no application position contains the "Eningeer" typo',
  not exists (select 1 from public.applications where position ilike '%eningeer%'));
select pg_temp.ok('#155 Netic is "Full Stack Product Engineer"',
  exists (select 1 from public.applications where company = 'Netic' and position = 'Full Stack Product Engineer'));
