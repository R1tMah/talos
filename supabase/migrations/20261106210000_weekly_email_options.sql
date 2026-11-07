-- Weekly email, more control: individual items instead of four big sections, the day and
-- hour it goes out, and an option to leave out empty lines ("no weigh-ins this week").
-- The summary now covers the 7 days ending on the send day (Mon–Sun when that's Sunday,
-- as before).

alter table public.weekly_email drop constraint weekly_email_sections_check;

-- The old sections become the items they held. Long-term reminders (new) come with Reminders.
update public.weekly_email set sections = array(
  select distinct i
  from unnest(sections) s,
       unnest(case s
         when 'reminders' then array['reminders', 'longterm', 'to_apply']
         when 'health' then array['weight', 'food', 'runs']
         when 'career' then array['applications', 'leetcode', 'callbacks']
         when 'ahead' then array['calendar', 'subscriptions']
         else array[s] end) i
);

alter table public.weekly_email
  alter column sections set default array['reminders', 'longterm', 'to_apply', 'weight', 'food', 'runs'],
  add constraint weekly_email_sections_check check (sections <@ array[
    'reminders', 'longterm', 'to_apply', 'weight', 'food', 'runs',
    'applications', 'leetcode', 'callbacks', 'calendar', 'subscriptions', 'spending'
  ]),
  -- 0 = Sunday … 6 = Saturday, in the owner's timezone.
  add column send_day smallint not null default 0 check (send_day between 0 and 6),
  -- From 4 AM: before that is still the previous day by the app's 4 AM rule.
  add column send_hour smallint not null default 13 check (send_hour between 4 and 23),
  add column hide_empty boolean not null default false;

grant update (send_day, send_hour, hide_empty) on public.weekly_email to authenticated;
