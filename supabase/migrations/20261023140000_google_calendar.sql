-- Google Calendar on Watch. The owner signs in with Google once (OAuth); the refresh
-- token is kept here and only the server (service role) can read it. Read-only scope
-- for now; writing events later is a scope upgrade on the same row.

create table public.google_auth (
  id int primary key default 1 check (id = 1),  -- one Google account
  email text,
  scope text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: the owner's session can't read or write the token.
-- The service role (server routes, the refresh job) bypasses RLS.
alter table public.google_auth enable row level security;
revoke all on public.google_auth from anon, authenticated;

-- What the app may show the owner: connected or not, which account, which access. Never the token.
create function public.google_status()
returns table (email text, scope text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.email, g.scope, g.updated_at from public.google_auth g where (select public.is_owner())
$$;
revoke execute on function public.google_status() from public, anon;
grant execute on function public.google_status() to authenticated;

alter table public.watch_sources drop constraint watch_sources_kind_check;
alter table public.watch_sources add constraint watch_sources_kind_check
  check (kind in ('espn_team', 'espn_news', 'headlines', 'jobs', 'weather', 'transit', 'newsletter', 'calendar'));
