-- Chat history (Settings > Chat history) reads past days from message_log.
-- Two things it couldn't show before: the tab chip a message went with, and the
-- cards that came back after a follow-up tap (Confirm, Yes save, a pick, Fill in).
alter table public.message_log add column tab text;
create index message_log_created_at_idx on public.message_log (created_at);

create table public.message_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.message_log(id),
  cards jsonb not null
);
create index message_followups_message_id_idx on public.message_followups (message_id);

alter table public.message_followups enable row level security;
grant select, insert on public.message_followups to authenticated;
create policy owner_all on public.message_followups for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- Days with chat, newest first, by the app's 4am rule in the owner's timezone.
create function public.chat_days()
returns table (day date, n integer)
language sql
stable
set search_path = ''
as $$
  select (m.created_at at time zone s.timezone - interval '4 hours')::date as day, count(*)::integer as n
  from public.message_log m, public.settings s
  where s.id = 1
  group by 1
  order by 1 desc
$$;

-- One logical day's messages, oldest first, each with its follow-up cards in order.
create function public.chat_day(p_day date)
returns table (id uuid, created_at timestamptz, text text, tab text, response jsonb, followups jsonb)
language sql
stable
set search_path = ''
as $$
  select m.id, m.created_at, m.text, m.tab, m.response,
    coalesce((select jsonb_agg(f.cards order by f.created_at) from public.message_followups f where f.message_id = m.id), '[]'::jsonb)
  from public.message_log m, public.settings s
  where s.id = 1
    and m.created_at >= (p_day + time '04:00') at time zone s.timezone
    and m.created_at < (p_day + 1 + time '04:00') at time zone s.timezone
  order by m.created_at
$$;

revoke execute on function public.chat_days(), public.chat_day(date) from public, anon;
grant execute on function public.chat_days(), public.chat_day(date) to authenticated;
