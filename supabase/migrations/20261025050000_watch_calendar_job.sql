-- The calendar is refreshed every 5 minutes on its own job, so an event added, moved
-- or deleted in Google shows up on Watch within minutes (the shared 15-minute tick
-- could leave it up to 30 minutes behind). Same route and Vault secrets as watch_tick;
-- the body names the kind, and the route refreshes every enabled source of it.

create function public.watch_tick_kind(p_kind text)
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
    body := jsonb_build_object('kind', p_kind),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.watch_tick_kind(text) from public, anon, authenticated;

select cron.schedule('watch-calendar', '*/5 * * * *', $$select public.watch_tick_kind('calendar')$$);
