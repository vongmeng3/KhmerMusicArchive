-- Run in the Supabase SQL Editor after ReviewGate.sql and EntryOwnerDelete.sql.
--
-- Decision (replaces ReviewerTakeDown.sql): a reviewer's Take down deletes
-- the entry for good, row and photo, so nothing taken down stays in the
-- database or in Storage. Contributors still delete only their own entries.
begin;

-- Take down no longer returns an entry; the old function is not used.
drop function if exists public.take_down_entry(uuid);

-- Reviewers may delete any entry.
drop policy if exists entries_delete_reviewer_allow on public.entries;
create policy entries_delete_reviewer_allow
  on public.entries for delete to authenticated
  using ((select public.is_reviewer()));

-- The restrictive guard is ANDed with every DELETE policy, so it must let
-- reviewers through too. Everyone else still needs to own the entry.
drop policy if exists entries_delete_owner_guard on public.entries;
create policy entries_delete_owner_guard
  on public.entries as restrictive for delete to public
  using ((select auth.uid()) = owner or (select public.is_reviewer()));

-- Storage remove() needs SELECT and DELETE on the photo, which lives in the
-- contributor's folder, not the reviewer's.
drop policy if exists photos_reviewer_cleanup_select on storage.objects;
create policy photos_reviewer_cleanup_select
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (select public.is_reviewer()));

drop policy if exists photos_reviewer_cleanup_delete on storage.objects;
create policy photos_reviewer_cleanup_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_reviewer()));

-- Same guard as EntryOwnerDelete.sql, plus reviewers: a photo that any entry
-- still uses is never removed.
drop policy if exists photos_owner_cleanup_guard on storage.objects;
create policy photos_owner_cleanup_guard
  on storage.objects as restrictive for delete to public
  using (
    bucket_id <> 'photos'
    or (
      ((storage.foldername(name))[1] = (select auth.uid())::text
        or (select public.is_reviewer()))
      and not exists (
        select 1 from public.entries as entry
        where strpos(entry.image, '/storage/v1/object/public/photos/' || storage.objects.name) > 0
      )
    )
  );

commit;
