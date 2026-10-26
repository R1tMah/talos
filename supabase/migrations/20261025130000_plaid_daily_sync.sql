-- Plaid syncs once a day on its own (PNC checking: balance and transactions), so
-- Finances is current without pressing Sync. 07:00 UTC is 3am in Boston (2am in
-- winter): half an hour before finance_snapshot, so the night's net worth uses the
-- fresh balance. Same Vault secrets as watch_tick; the route checks the cron secret.

create function public.plaid_sync_tick()
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
    url := replace(v_url, '/api/watch/refresh', '/api/plaid/sync'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.plaid_sync_tick() from public, anon, authenticated;

select cron.schedule('plaid-daily-sync', '0 7 * * *', 'select public.plaid_sync_tick()');
