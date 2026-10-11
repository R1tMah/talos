-- Breaks: dated periods of untracked or off-plan eating (trips, a week at home).
-- They sit on top of phases and never change any computed number; the app only
-- shows the dates and the owner's label, verbatim.

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date,                 -- null = ongoing
  label text not null,           -- verbatim, never rewritten
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or end_date >= start_date)
);

alter table public.breaks enable row level security;

grant select, insert, update on public.breaks to authenticated;

create policy owner_all on public.breaks for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
