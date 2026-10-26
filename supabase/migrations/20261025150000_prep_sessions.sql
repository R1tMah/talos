-- System Design Prep, with the real curriculum: 16 sessions over 4 weeks (Mon, Wed, Fri
-- lessons, Sunday mock), kept as static data in the app. The source's config is just
-- the start date; "Mark done" stores one row per session here.

create table public.prep_completions (
  curriculum_id text not null,
  session int not null check (session > 0),
  done_at timestamptz not null default now(),
  primary key (curriculum_id, session)
);

alter table public.prep_completions enable row level security;
grant select, insert, delete on public.prep_completions to authenticated;
create policy owner_all on public.prep_completions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Day 1 is the curriculum's suggested start, Monday Oct 26, 2026 (changeable in settings).
update public.watch_sources set config = '{"start": "2026-10-26"}'::jsonb where kind = 'prep';
