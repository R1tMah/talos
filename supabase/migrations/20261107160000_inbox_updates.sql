-- Inbox updates: the owner's Gmail is scanned every 15 minutes for job application
-- emails (confirmations, OA invites, interview invites, rejections). Each one Claude
-- recognizes becomes a pending update, asked about in a banner ("Did you get a rejection
-- from Ramp?"). Nothing changes in Applications until the owner taps "Yes, update".
--
-- Only email that arrives after this is switched on is scanned (inbox_scan.started_at).
-- Every message looked at is remembered by its Gmail id, relevant or not, so none is
-- classified twice.

create table public.inbox_scan (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  started_at timestamptz not null default now(),   -- nothing older than this is scanned
  last_scanned_at timestamptz,                     -- the scan window's end last time
  last_error text,                                 -- why the last scan failed; null when it worked
  updated_at timestamptz not null default now()
);
insert into public.inbox_scan default values;

alter table public.inbox_scan enable row level security;
grant select on public.inbox_scan to authenticated;
grant update (enabled, updated_at) on public.inbox_scan to authenticated;
create policy owner_read on public.inbox_scan for select to authenticated using ((select public.is_owner()));
create policy owner_update on public.inbox_scan for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Every message the scan has looked at, and what it was. Written by the server only.
create table public.inbox_messages (
  message_id text primary key,                     -- Gmail's id
  received_at timestamptz,
  kind text not null check (kind in ('confirmation', 'oa_invite', 'interview_invite', 'rejection', 'irrelevant', 'unreadable')),
  created_at timestamptz not null default now()
);
alter table public.inbox_messages enable row level security;
grant select on public.inbox_messages to authenticated;
create policy owner_read on public.inbox_messages for select to authenticated using ((select public.is_owner()));

-- What a recognized email proposes. application_id null = a company not tracked yet,
-- so "Yes" adds it. The banner's wording comes from kind, company and role.
create table public.pending_inbox_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id text not null unique references public.inbox_messages(message_id),
  kind text not null check (kind in ('confirmation', 'oa_invite', 'interview_invite', 'rejection')),
  company text not null check (btrim(company) <> ''),
  role text,
  email_date date not null,
  subject text,
  sender text,
  application_id uuid references public.applications(id),
  proposed_status text not null check (proposed_status in ('Applied', 'OA Stage', 'Interview', 'Rejected'))
);
create index pending_inbox_updates_created_idx on public.pending_inbox_updates (created_at);

alter table public.pending_inbox_updates enable row level security;
grant select, delete on public.pending_inbox_updates to authenticated;
create policy owner_all on public.pending_inbox_updates for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- "Yes, update": applies one pending update and clears it, together.
--   - a tracked application gets the proposed status;
--   - an untracked company is added (role, email date, proposed status), which also
--     closes any open "to apply" reminder for it (close_apply_reminders trigger);
--   - an OA or interview invite is also logged in Callbacks.
-- Each write goes through the usual function, so each has its own Undo.
create function public.apply_inbox_update(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  u public.pending_inbox_updates;
  a public.applications;
  v_app jsonb;
  v_cb jsonb := null;
begin
  select * into u from public.pending_inbox_updates where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if u.application_id is not null then
    select * into a from public.applications where id = u.application_id and deleted_at is null;
  end if;
  if a.id is not null then
    v_app := public.update_application(a.id, a.company, a.position, a.applied_date, u.proposed_status, a.resume_name, 'inbox');
  else
    v_app := public.save_application(u.company, coalesce(nullif(btrim(u.role), ''), 'Unknown role'), u.email_date, u.proposed_status, null, 'inbox');
  end if;

  if u.kind in ('oa_invite', 'interview_invite') then
    v_cb := public.log_callback(u.email_date, coalesce(a.company, u.company), case u.kind when 'oa_invite' then 'OA' else 'Interview' end, null, null, null, 'inbox');
  end if;

  delete from public.pending_inbox_updates where id = p_id;
  return jsonb_build_object('status', 'saved', 'application', v_app, 'callback', v_cb);
end;
$$;

revoke execute on function public.apply_inbox_update(uuid) from public, anon;
grant execute on function public.apply_inbox_update(uuid) to authenticated;

-- ---- The 15-minute scan -----------------------------------------------------------------

-- Same secrets as Watch, the weekly email and Future Letters. Null until they're set.
create function public.inbox_scan_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.inbox_scan where id = 1 and enabled) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'watch_refresh_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'watch_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := replace(v_url, '/api/watch/refresh', '/api/inbox/scan'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.inbox_scan_tick() from public, anon, authenticated;
select cron.schedule('inbox-scan', '*/15 * * * *', 'select public.inbox_scan_tick()');
