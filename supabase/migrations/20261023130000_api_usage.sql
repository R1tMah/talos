-- Token usage of every Claude API call the app makes (chat agent), as the API reported it.
-- Settings > API usage sums these and prices them. Append-only; not part of Undo.

create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0)
);

create index api_usage_created_at on public.api_usage (created_at);

alter table public.api_usage enable row level security;
grant select, insert on public.api_usage to authenticated;
create policy owner_all on public.api_usage for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
