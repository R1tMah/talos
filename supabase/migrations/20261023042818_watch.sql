-- Watch: the read-only side of TALOS. Outside information (scores, headlines, job
-- postings, weather, trains), kept apart from the Track tabs.
--
-- A scheduled server job fetches each source and stores what it got; the app only
-- displays what's stored. Nothing here is written, summarized or ranked by AI.
--
--   watch_sources  one row per source: its adapter (kind), the owner's settings for it,
--                  and the latest snapshot the tab shows. Written by the refresh job
--                  (service role) and by the owner's settings form.
--   watch_items    sources that track individual postings over time (jobs): when each
--                  was first seen and when it closed, so the tab can show what's new.
--
-- Train departures are the exception: they're fetched live when the card is open
-- (cached for a few seconds), since a 15-minute-old departure is useless.
--
-- Scheduling: pg_cron calls public.watch_tick() every 15 minutes, which POSTs to the
-- app's /api/watch/refresh route; the route refreshes whichever sources are due by
-- their own every_minutes. The route's URL and shared secret live in Vault
-- (watch_refresh_url, watch_cron_secret) and are set once by hand, never in a
-- migration. Until both exist the tick does nothing.

create table public.watch_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('espn_team', 'espn_news', 'headlines', 'jobs', 'weather', 'transit', 'newsletter')),
  title text not null check (btrim(title) <> ''),
  config jsonb not null default '{}'::jsonb,
  position int not null default 0,
  enabled boolean not null default true,
  every_minutes int not null default 30 check (every_minutes between 15 and 1440),
  data jsonb,               -- latest snapshot; null until the first successful fetch
  fetched_at timestamptz,   -- last successful fetch
  tried_at timestamptz,     -- last attempt, successful or not
  error text,               -- why the last attempt failed; null when it worked
  seen_at timestamptz       -- when the owner last opened the tab ("new since you last looked")
);

create table public.watch_items (
  source_id uuid not null references public.watch_sources (id) on delete cascade,
  key text not null,        -- the source's own id for the item
  data jsonb not null,
  first_seen timestamptz not null default now(),
  closed_at timestamptz,
  primary key (source_id, key)
);

create index watch_items_recent on public.watch_items (source_id, first_seen desc);

alter table public.watch_sources enable row level security;
alter table public.watch_items enable row level security;

-- The owner reads everything and edits source settings; only the refresh job (service
-- role, which bypasses RLS) writes snapshots and items.
grant select, insert, update on public.watch_sources to authenticated;
grant select on public.watch_items to authenticated;
grant all on public.watch_sources, public.watch_items to service_role;

create policy owner_all on public.watch_sources for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_read on public.watch_items for select to authenticated
  using ((select public.is_owner()));

-- The starting sources. Settings are editable from each tab's form.
insert into public.watch_sources (kind, title, position, every_minutes, config) values
  ('transit', 'Green Line B', 0, 15, '{
    "route": "Green-B",
    "timezone": "America/New_York",
    "switch_at": "12:00",
    "before_switch": {"label": "To Government Center", "board_stop": "Packard''s Corner", "destination": "Government Center"},
    "after_switch": {"label": "To Boston College", "board_stop": "Government Center", "destination": "Boston College"},
    "departures_shown": 3,
    "show_alerts_for": "Green-B",
    "manual_flip_toggle": true,
    "cache_seconds": 20
  }'),
  ('weather', 'Weather', 1, 30, '{"place": "Allston", "lat": 42.3519, "lon": -71.1252, "timezone": "America/New_York"}'),
  ('espn_team', 'Trail Blazers', 2, 30, '{"sport": "basketball", "league": "nba", "team": "por"}'),
  ('espn_news', 'NFL', 3, 60, '{"sport": "football", "league": "nfl", "limit": 15}'),
  ('headlines', 'Tech', 4, 60, '{"hn": true, "feeds": [], "limit": 15}'),
  ('jobs', 'New-grad jobs', 5, 240, '{"categories": ["Software", "Software Engineering", "AI/ML/Data"], "locations": [], "exclude": []}');

-- ---- Schedule -----------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- One tick: ask the app to refresh whatever is due. Returns the pg_net request id, or
-- null when the URL or secret hasn't been set yet.
create function public.watch_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'watch_refresh_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'watch_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.watch_tick() from public, anon, authenticated;

select cron.schedule('watch-refresh', '*/15 * * * *', 'select public.watch_tick()');
