-- The Sprint 3 review gate (Lab 10), copied from what is installed in the
-- live project on 2026-11-03. Run in the Supabase SQL Editor; safe to re-run.
-- The reviewers table (one user_id per reviewer) was created in Lab 10 and
-- is not recreated here. Reviewer take down lives in ReviewerDelete.sql.
begin;

-- New and edited entries wait for review unless something says otherwise.
alter table public.entries
  add column if not exists status text default 'pending';
alter table public.entries alter column status set default 'pending';

-- Nobody reads, adds or removes reviewers through the API. With RLS on and
-- no policies, every request is refused; the functions below still see the
-- table because they run as security definer.
alter table public.reviewers enable row level security;

-- True when the signed-in account is on the reviewers list.
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.reviewers where user_id = (select auth.uid()));
$$;

-- The only way a contributor's entry becomes published: a reviewer decides,
-- and only while the entry is still pending. Returns false, never an error,
-- so a second tab deciding the same entry fails politely.
create or replace function public.review_entry(entry_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_reviewer() then
    return false;
  end if;
  if decision not in ('published', 'returned') then
    return false;
  end if;
  update public.entries set status = decision
    where id = entry_id and status = 'pending';
  return found;
end;
$$;
revoke execute on function public.review_entry(uuid, text) from public, anon;
grant execute on function public.review_entry(uuid, text) to authenticated;

-- Visitors see published entries; owners also see their own; reviewers see all.
drop policy if exists "anyone can read published entries" on public.entries;
create policy "anyone can read published entries"
  on public.entries for select
  using (status = 'published'
    or (select auth.uid()) = owner
    or (select public.is_reviewer()));

-- A contributor can only add their own entry, and only as pending.
drop policy if exists "owners add their own entries" on public.entries;
create policy "owners add their own entries"
  on public.entries for insert
  with check ((select auth.uid()) = owner and status = 'pending');

-- After an owner's edit the entry must be pending again, so a contributor
-- cannot publish their own entry or quietly change a published one.
-- Reviewers may keep their own entries' status. entries_edit_owner_guard
-- (EntryOwnerUpdate.sql) still stops anyone editing someone else's entry.
drop policy if exists "owners edit their own entries" on public.entries;
create policy "owners edit their own entries"
  on public.entries for update
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner
    and (status = 'pending' or (select public.is_reviewer())));

commit;
