-- Future Letters: letters to the owner's future self, sealed until a delivery time.
--
-- The body of a sealed letter is unreadable from the app, enforced here rather than by
-- the screens: the authenticated role has no SELECT on future_letters.body at all, so no
-- query, bug or stray select("*") can bring it to the browser. Bodies come back only
-- through opened_letters(), and only for letters whose time has come.
--
-- Opening: a letter opens at deliver_at. opened_letters() opens due letters as it reads
-- (so a letter is there on time even if the cron is late), and the 15-minute cron opens
-- them too and emails each one to the owner (/api/letters/deliver). A failed email
-- doesn't hold a letter back; it's retried each tick and the error shows on the page.

create table public.future_letters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),       -- when it was sealed in Talos
  written_at timestamptz not null default now(),        -- when it was written (earlier for imported letters)
  deliver_at timestamptz not null,
  body text not null check (btrim(body) <> ''),
  opened_at timestamptz,                                -- null while sealed
  emailed_at timestamptz,
  email_error text,
  check (deliver_at > written_at)
);

create index future_letters_due_idx on public.future_letters (deliver_at) where opened_at is null;
create index future_letters_email_idx on public.future_letters (opened_at) where opened_at is not null and emailed_at is null;

alter table public.future_letters enable row level security;
create policy owner_all on public.future_letters for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Everything except the body. Writing a letter is allowed; reading it back is not.
revoke all on public.future_letters from anon, authenticated;
grant select (id, created_at, written_at, deliver_at, opened_at, emailed_at, email_error) on public.future_letters to authenticated;
grant insert (written_at, deliver_at, body) on public.future_letters to authenticated;
grant update (deliver_at) on public.future_letters to authenticated;
grant delete on public.future_letters to authenticated;

-- A sealed letter can be postponed, never brought forward (no early peeks), and an
-- opened one can't be re-sealed. A new letter has to be for later.
create function public.future_letters_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The owner's own letters from the app. The server (service role) can also import old
  -- letters as they were: already delivered, opened and emailed (scripts/import-letters.mts).
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      if new.deliver_at <= now() then
        raise exception 'A letter has to unlock in the future';
      end if;
      new.created_at := now();
      new.opened_at := null;
      new.emailed_at := null;
      new.email_error := null;
    end if;
    return new;
  end if;
  -- The owner's own updates; the server (service role) opens and emails letters.
  if current_user = 'authenticated' then
    if old.opened_at is not null then
      raise exception 'This letter is already open';
    end if;
    if new.deliver_at < old.deliver_at then
      raise exception 'A sealed letter can only be postponed';
    end if;
  end if;
  return new;
end;
$$;

create trigger future_letters_guard
before insert or update on public.future_letters
for each row execute function public.future_letters_guard();

-- Opens letters whose time has come. Returns how many it opened.
create function public.open_due_letters()
returns int
language sql
security definer
set search_path = ''
as $$
  with opened as (
    update public.future_letters set opened_at = now()
    where opened_at is null and deliver_at <= now()
    returning 1
  )
  select count(*)::int from opened;
$$;

-- The opened letters, with their bodies: the only way the app reads a body. Opens any
-- that just came due first.
create function public.opened_letters()
returns table (id uuid, written_at timestamptz, deliver_at timestamptz, opened_at timestamptz, emailed_at timestamptz, email_error text, body text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_owner()) then
    raise exception 'not allowed';
  end if;
  perform public.open_due_letters();
  return query
    select l.id, l.written_at, l.deliver_at, l.opened_at, l.emailed_at, l.email_error, l.body
    from public.future_letters l
    where l.opened_at is not null
    order by l.opened_at desc;
end;
$$;

revoke execute on function public.open_due_letters() from public, anon, authenticated;
revoke execute on function public.opened_letters() from public, anon;
grant execute on function public.opened_letters() to authenticated;

-- ---- Delivery: every 15 minutes, open due letters and email them ----------------------

-- Same secrets as Watch and the weekly email. Null until they're set.
create function public.future_letters_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Nothing to do: no request.
  if not exists (
    select 1 from public.future_letters
    where (opened_at is null and deliver_at <= now()) or (opened_at is not null and emailed_at is null)
  ) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'watch_refresh_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'watch_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := replace(v_url, '/api/watch/refresh', '/api/letters/deliver'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.future_letters_tick() from public, anon, authenticated;
select cron.schedule('future-letters', '*/15 * * * *', 'select public.future_letters_tick()');
