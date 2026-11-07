-- End of day (EOD): typing "EOD" in chat asks these questions one by one; the answers
-- become journal entries, notes and spending, shown on one card and saved together.
-- The owner edits the questions in Settings > End of day: what each asks, where its
-- answer goes, whether it's asked, and in what order.

create table public.eod_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  position int not null default 0,
  prompt text not null check (btrim(prompt) <> '' and length(prompt) <= 200),
  -- Where the answer goes: a notes kind, or spending.
  target text not null check (target in ('journal', 'personal', 'content', 'talos', 'spending')),
  enabled boolean not null default true
);

create index eod_questions_position_idx on public.eod_questions (position, created_at);

alter table public.eod_questions enable row level security;
grant select, insert, update, delete on public.eod_questions to authenticated;
create policy owner_all on public.eod_questions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

insert into public.eod_questions (position, prompt, target) values
  (0, 'Work journal: what got done, learned, or decided today?', 'journal'),
  (1, 'Personal journal: what''s on your mind?', 'personal'),
  (2, 'Any cash or Venmo spending today?', 'spending');

-- ---- Saving an EOD: every entry or none ------------------------------------------------

-- p_notes: [{ "kind": "journal" | "personal" | "content" | "talos", "body": text }]
-- p_spending: [{ "amount": number, "what": text, "category": text }]
-- One call, one transaction: a bad entry raises and nothing is written. Each row gets its
-- own actions row, so each can be undone on its own. Returns the rows and action ids in
-- the order given (notes, then spending).
create function public.save_eod(p_date date, p_notes jsonb, p_spending jsonb, p_tool text default 'eod')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_note public.notes;
  v_spend public.spending;
  v_action uuid;
  v_saved jsonb := '[]';
  e jsonb;
begin
  if jsonb_typeof(coalesce(p_notes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_spending, '[]')) <> 'array' then
    raise exception 'p_notes and p_spending must be json arrays';
  end if;
  if jsonb_array_length(coalesce(p_notes, '[]')) + jsonb_array_length(coalesce(p_spending, '[]')) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_notes, '[]')) loop
    if e->>'kind' not in ('journal', 'personal', 'content', 'talos') or btrim(coalesce(e->>'body', '')) = '' then
      raise exception 'bad EOD note: %', e;
    end if;
    insert into public.notes (kind, logical_date, body) values (e->>'kind', p_date, e->>'body') returning * into v_note;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'notes', v_note.id, null, to_jsonb(v_note)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'notes', 'row', to_jsonb(v_note), 'action_id', v_action);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_spending, '[]')) loop
    if (e->>'amount')::numeric is null or (e->>'amount')::numeric <= 0 or btrim(coalesce(e->>'what', '')) = '' then
      raise exception 'bad EOD spending: %', e;
    end if;
    insert into public.spending (logical_date, amount, what, category)
    values (p_date, round((e->>'amount')::numeric, 2), btrim(e->>'what'), coalesce(e->>'category', 'Other'))
    returning * into v_spend;
    insert into public.actions (tool, table_name, row_id, before, after)
    values (p_tool, 'spending', v_spend.id, null, to_jsonb(v_spend)) returning id into v_action;
    v_saved := v_saved || jsonb_build_object('table', 'spending', 'row', to_jsonb(v_spend), 'action_id', v_action);
  end loop;

  return jsonb_build_object('status', 'saved', 'saved', v_saved);
end;
$$;

revoke execute on function public.save_eod(date, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_eod(date, jsonb, jsonb, text) to authenticated;
