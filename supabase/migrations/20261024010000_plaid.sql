-- Plaid: live PNC checking and Vanguard data for Finances.
--
-- Each bank login is one Plaid "Item". Its access token reads that bank's data, so
-- it's kept like the Google token: RLS on with no policies, readable only by the
-- service role (server routes). The app sees status through plaid_status().
--
-- Synced rows land in the existing Finances tables, tagged with the Item they came
-- from. Disconnecting an Item deletes its synced rows; hand-entered rows are never
-- touched by sync. Synced writes don't go in the actions log (they aren't the
-- owner's edits, and Undo would just be re-synced).

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id text not null unique,
  env text not null check (env in ('sandbox', 'production')),
  kind text not null check (kind in ('checking', 'investments')),
  institution_name text,
  access_token text not null,
  cursor text,                                   -- /transactions/sync position
  status text not null default 'ok' check (status in ('ok', 'login_required', 'pending_expiration', 'error')),
  error_code text,
  last_synced_at timestamptz
);

alter table public.plaid_items enable row level security;
revoke all on public.plaid_items from anon, authenticated;

-- Synced rows remember where they came from; hand-entered rows have plaid_item null.
alter table public.finance_transactions
  add column plaid_item uuid references public.plaid_items(id) on delete cascade,
  add column plaid_transaction_id text unique,
  add column pending boolean not null default false;

alter table public.checking_balances
  add column plaid_item uuid references public.plaid_items(id) on delete cascade;

alter table public.vanguard_holdings
  add column plaid_item uuid references public.plaid_items(id) on delete cascade,
  add column plaid_key text;  -- account_id:security_id, so a resync updates the same row

-- Not partial, so sync can upsert on it; hand-entered rows (nulls) never conflict.
create unique index vanguard_holdings_plaid_key_idx on public.vanguard_holdings (plaid_item, plaid_key);

-- What the app may show: which banks are connected, and whether they need attention. Never the token.
create function public.plaid_status()
returns table (id uuid, env text, kind text, institution_name text, status text, error_code text, last_synced_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.env, p.kind, p.institution_name, p.status, p.error_code, p.last_synced_at
  from public.plaid_items p
  where (select public.is_owner())
  order by p.created_at
$$;

revoke execute on function public.plaid_status() from public, anon;
grant execute on function public.plaid_status() to authenticated;
