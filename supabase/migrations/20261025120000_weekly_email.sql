-- The Sunday email: open reminders plus a weekly summary, sent from the owner's Gmail
-- to themselves at 1 PM their time. Which sections go in is set in Settings.
--
-- pg_cron ticks every 15 minutes; the app decides whether it's Sunday 1 PM where the
-- owner is (cron runs in UTC and DST moves the hour) and sends at most once per Sunday.
-- The tick reuses the Watch Vault secrets: same app, same cron secret, so nothing new
-- to set up once Watch's schedule works.

create table public.weekly_email (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  sections text[] not null default array['reminders', 'health']
    check (sections <@ array['reminders', 'health', 'career', 'ahead']),
  last_sent_on date,  -- the Sunday it last went out on schedule (test sends don't count)
  last_error text,    -- why the last scheduled send failed; null when it worked
  updated_at timestamptz not null default now()
);
insert into public.weekly_email default values;

alter table public.weekly_email enable row level security;
grant select on public.weekly_email to authenticated;
-- The owner changes what's sent; only the server records sends.
grant update (enabled, sections, updated_at) on public.weekly_email to authenticated;
create policy owner_read on public.weekly_email for select to authenticated using ((select public.is_owner()));
create policy owner_update on public.weekly_email for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- One tick: ask the app whether the email is due. Null until the Watch secrets are set.
create function public.weekly_email_tick()
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
    url := replace(v_url, '/api/watch/refresh', '/api/email/weekly'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.weekly_email_tick() from public, anon, authenticated;

select cron.schedule('weekly-email', '*/15 * * * *', 'select public.weekly_email_tick()');
