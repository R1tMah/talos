-- EOD questions can be about any tab chat logs to. Besides the journals, notes, spending
-- and own-log answers that save_eod writes itself, a question can now target weight,
-- food, LeetCode, runs, applications, callbacks, subscriptions, recommendations or new
-- reminders. Those answers are read with that tab's chat tools and, on Save EOD, saved
-- through them (each with its own Undo), right after the save_eod transaction.

alter table public.eod_questions drop constraint eod_questions_target_check;
alter table public.eod_questions add constraint eod_questions_target_check
  check (target in (
    'journal', 'personal', 'content', 'talos', 'spending', 'custom',
    'weight', 'nutrition', 'leetcode', 'runs', 'applications', 'callbacks', 'subscriptions', 'experiences', 'reminders'
  ));
