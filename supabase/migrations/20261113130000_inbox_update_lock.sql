-- apply_inbox_update locks the pending row with select ... for update, which needs the
-- UPDATE privilege, but 20261107160000_inbox_updates granted only select and delete, so
-- "Yes, update" failed with 42501. Granting update on one column is enough for the lock;
-- the owner_all policy already limits it to the owner.
grant update (proposed_status) on public.pending_inbox_updates to authenticated;
