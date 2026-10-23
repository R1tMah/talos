-- Talos improvements: a notepad for ideas and fixes for this app (notes.kind = 'talos'),
-- next to Content, the Work Journal and the Personal Journal. Same table and functions.
alter table public.notes drop constraint notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind = any (array['content', 'journal', 'weight', 'personal', 'talos']));

alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos']);
