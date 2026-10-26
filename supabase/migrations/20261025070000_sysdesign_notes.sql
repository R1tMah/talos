-- System design mocks: a notepad for the AI-written summaries of how each mock
-- interview went, pasted in afterwards (notes.kind = 'sysdesign'). Same table and
-- functions as the other notepads; archivable like them. Not offered in chat.
alter table public.notes drop constraint notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind = any (array['content', 'journal', 'weight', 'personal', 'talos', 'sysdesign']));

alter table public.settings drop constraint settings_archived_tabs_check;
alter table public.settings add constraint settings_archived_tabs_check
  check (archived_tabs <@ array['leetcode', 'runs', 'applications', 'callbacks', 'content', 'journal', 'personal', 'talos', 'sysdesign']);
