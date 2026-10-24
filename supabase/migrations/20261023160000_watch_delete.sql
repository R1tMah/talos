-- Watch sources can be deleted for good from their settings (hiding stays the soft option).
-- Their stored items go with them (watch_items.source_id is on delete cascade).
grant delete on public.watch_sources to authenticated;
