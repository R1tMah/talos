-- Chat history: days split at 4am in the Settings timezone, follow-ups kept with their message.

select pg_temp.put('tz', (select timezone from public.settings where id = 1));
insert into public.message_log (client_msg_id, text, created_at)
values ('zz-hist-late', 'late night', ('2099-10-02 03:30'::timestamp at time zone pg_temp.get('tz'))),
       ('zz-hist-morning', 'morning', ('2099-10-02 04:30'::timestamp at time zone pg_temp.get('tz')));
insert into public.message_followups (message_id, cards)
values ((select id from public.message_log where client_msg_id = 'zz-hist-morning'), '[{"kind": "saved", "label": "Weight 168.2 lb"}]');

select pg_temp.ok('a message before 4am belongs to the day before',
  (select array_agg(text) = array['late night'] from public.chat_day('2099-10-01')));
select pg_temp.ok('a message after 4am belongs to that day',
  (select array_agg(text) = array['morning'] from public.chat_day('2099-10-02')));
select pg_temp.ok('follow-up cards come back with their message',
  (select followups = '[[{"kind": "saved", "label": "Weight 168.2 lb"}]]'::jsonb from public.chat_day('2099-10-02')));
select pg_temp.ok('a message with no follow-ups gets an empty list',
  (select followups = '[]'::jsonb from public.chat_day('2099-10-01')));
select pg_temp.ok('chat_days counts each logical day',
  (select array_agg(n order by day) = array[1, 1] from public.chat_days() where day in ('2099-10-01', '2099-10-02')));
