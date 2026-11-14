-- Behavioral mocks: the tables' rules, the model picks, and archiving the tab.

-- An insert ... returning can't sit in a subquery, so each one is a CTE.
with x as (insert into public.mock_sessions (company, role) values ('Stripe', 'Product Engineer') returning id)
select pg_temp.put('s', id::text) from x;

with x as (insert into public.mock_questions (session_id, position, area, question, rubric, target_time_seconds, model)
  values (pg_temp.get('s')::uuid, 1, 'Navigating Ambiguity', 'Tell me about a pivot.', '{"requirements":["STAR"]}', 120, 'claude-sonnet-5-5') returning id)
select pg_temp.put('q', id::text) from x;
select pg_temp.ok('a question needs one of the seven areas',
  pg_temp.err(format($$insert into public.mock_questions (session_id, position, area, question, rubric, target_time_seconds, model) values (%L, 2, 'Vibes', 'Q', '{}', 120, 'm')$$, pg_temp.get('s'))) = '23514');
select pg_temp.ok('two questions can''t share a place in the mock',
  pg_temp.err(format($$insert into public.mock_questions (session_id, position, area, question, rubric, target_time_seconds, model) values (%L, 1, 'Failure & Growth', 'Q', '{}', 120, 'm')$$, pg_temp.get('s'))) = '23505');
select pg_temp.ok('a target outside 60 to 300 seconds is rejected',
  pg_temp.err(format($$insert into public.mock_questions (session_id, position, area, question, rubric, target_time_seconds, model) values (%L, 3, 'Failure & Growth', 'Q', '{}', 20, 'm')$$, pg_temp.get('s'))) = '23514');

insert into public.mock_answers (question_id, transcription, duration_seconds, target_time_seconds, content_score, yap_penalty, final_score, feedback, model)
values (pg_temp.get('q')::uuid, 'So the situation was...', 155, 120, 8, 2, 6, '{}', 'claude-haiku-5-5');
select pg_temp.ok('a graded answer is saved with its scores',
  exists (select 1 from public.mock_answers where question_id = pg_temp.get('q')::uuid and final_score = 6 and yap_penalty = 2));
select pg_temp.ok('a Yap Penalty over 3 is rejected',
  pg_temp.err(format($$insert into public.mock_answers (question_id, transcription, duration_seconds, target_time_seconds, content_score, yap_penalty, final_score, feedback, model)
    values (%L, 'x', 400, 120, 8, 5, 3, '{}', 'm')$$, pg_temp.get('q'))) = '23514');

select pg_temp.ok('the default models are Sonnet for questions and Haiku for grading',
  (select architect_model = 'claude-sonnet-5-5' and grader_model = 'claude-haiku-5-5' from public.mock_settings where id = 1));
update public.mock_settings set grader_model = 'claude-opus-5-5' where id = 1;
select pg_temp.ok('the owner can pick another listed model',
  (select grader_model from public.mock_settings where id = 1) = 'claude-opus-5-5');
select pg_temp.ok('a model that isn''t listed is rejected',
  pg_temp.err($$update public.mock_settings set architect_model = 'gpt-5' where id = 1$$) = '23514');

select pg_temp.ok('the Behavioral tab can be archived',
  (public.set_tab_archived('behavioral', true)->>'status') in ('saved', 'unchanged'));
