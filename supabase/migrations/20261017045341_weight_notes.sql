-- Dated free-text notes in the weight log ("weight loss has plateaued", caveats about
-- tracking). Same notes table and functions as content ideas and the journal, so
-- they get Undo and verbatim storage for free; the Content and Journal tabs filter
-- by kind and never show them.
alter table public.notes drop constraint notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind = any (array['content', 'journal', 'weight']));
