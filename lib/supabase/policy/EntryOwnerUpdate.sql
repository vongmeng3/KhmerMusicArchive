-- Run in the Supabase SQL Editor before enabling owner editing.
-- Keep the archive's existing SELECT and INSERT policies.
-- The permissive UPDATE policy lives in ReviewGate.sql, because it must also
-- send every contributor edit back to pending. Do not add a second permissive
-- UPDATE policy here: permissive policies combine with OR, so one without the
-- status check would let a contributor publish their own entry.
begin;

alter table public.entries enable row level security;
revoke update on public.entries from anon;
grant update on public.entries to authenticated;

-- Removes the old owner-only policy if an earlier run of this file added it.
drop policy if exists entries_edit_owner_allow on public.entries;

-- Restrictive policies are combined with AND, so a pre-existing broad
-- UPDATE or ALL policy cannot allow editing somebody else's entry.
-- USING checks the old owner; WITH CHECK prevents ownership transfer.
drop policy if exists entries_edit_owner_guard on public.entries;
create policy entries_edit_owner_guard
  on public.entries
  as restrictive
  for update
  to public
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

commit;
