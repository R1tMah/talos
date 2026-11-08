-- Which rows each TALOS home card shows (Settings > Home cards). One row of settings:
-- rows = { "<card>": ["<row>", ...] }. A card that isn't in it shows its defaults
-- (lib/homeCards.ts), so an empty object means "every card as it was".

create table public.home_cards (
  id int primary key default 1 check (id = 1),
  rows jsonb not null default '{}' check (jsonb_typeof(rows) = 'object'),
  updated_at timestamptz not null default now()
);
insert into public.home_cards default values;

alter table public.home_cards enable row level security;
grant select on public.home_cards to authenticated;
grant update (rows, updated_at) on public.home_cards to authenticated;
create policy owner_read on public.home_cards for select to authenticated using ((select public.is_owner()));
create policy owner_update on public.home_cards for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
