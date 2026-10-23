-- Personal journal: a third notepad next to Content and the Work Journal
-- (notes.kind = 'personal'). Same table and functions, so entries are verbatim and
-- Undo works; the other notepads filter by kind and never show them. It can be
-- archived like the other notepads.
alter table public.notes drop constraint notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind = any (array['content', 'journal', 'weight', 'personal']));

alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal']);
