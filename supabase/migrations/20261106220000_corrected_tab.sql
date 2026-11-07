-- Where the owner filed a message after "Where does this go?": the tab of the option
-- they tapped, or the tab they picked or typed instead. A later message that reads
-- like this one puts that tab first on its own "Where does this go?" card.
alter table public.message_log add column corrected_tab text;

create index message_log_corrected_idx on public.message_log (created_at desc) where corrected_tab is not null;
