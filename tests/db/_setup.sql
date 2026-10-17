-- Prepended to every database test file. Opens a transaction as the owner (so RLS
-- applies exactly as in the app) and never commits: nothing a test writes is kept.

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);

create temp table _t (n serial, id text, ok boolean, detail text) on commit drop;
create temp table _v (k text primary key, v text) on commit drop;

-- Records one test result.
create function pg_temp.ok(p_id text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into _t (id, ok, detail) values (p_id, coalesce(p_ok, false), p_detail) $$;

-- Runs a statement and returns its SQLSTATE, or null if it succeeded. The statement
-- runs in a subtransaction, so a failure doesn't abort the test file.
create function pg_temp.err(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- Remembers a value (e.g. an id) for later statements.
create function pg_temp.put(p_k text, p_v text) returns text
language sql as $$ insert into _v values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v $$;
create function pg_temp.get(p_k text) returns text language sql as $$ select v from _v where k = p_k $$;
