import { isEntryId } from "./entry-slugs.js";
import { cleanEntryPhoto } from "./entry-photo-cleanup.js";
import { cleanupDiagnostic } from "./entry-cleanup-diagnostics.js";

export async function deleteEntry(supabase, id, owner) {
  if (typeof id !== "string" || !isEntryId(id)) return { deleted: false, error: "This entry has an invalid ID and could not be deleted." };
  let snapshot;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== owner) {
      return { deleted: false, error: "Only the entry's owner can delete it. Please log in with that account." };
    }

    // Capture the photo before deleting its entry so a failed cleanup can be retried.
    const { data: entry, error: loadError } = await supabase.from("entries").select("id, owner, image")
      .eq("id", id.toLowerCase()).eq("owner", user.id).maybeSingle();
    cleanupDiagnostic("entry-read-response", { entryId: id, data: entry, error: loadError });
    if (loadError || entry?.id !== id.toLowerCase() || entry?.owner !== user.id) {
      return { deleted: false, error: "Unable to load an entry you own for deletion. Please refresh and try again." };
    }
    snapshot = { id: entry.id, owner: entry.owner, image: entry.image };
    cleanupDiagnostic("photo-captured", { entryId: entry.id, ownerId: entry.owner, imageUrl: entry.image });

    let request = supabase.from("entries").delete().eq("id", entry.id).eq("owner", user.id);
    // Stop if another tab replaced the captured photo while deletion was pending.
    request = entry.image == null ? request.is("image", null) : request.eq("image", entry.image);
    const { data, error } = await request.select("id, owner").maybeSingle();
    cleanupDiagnostic("entry-delete-response", { entryId: entry.id, data, error });
    if (error || data?.id !== entry.id || data?.owner !== user.id) {
      return { deleted: false, error: "No entry was deleted. It may have changed or you may no longer have permission to delete it." };
    }
  } catch (error) {
    cleanupDiagnostic("entry-delete-exception", { entryId: id, error });
    return { deleted: false, error: "Unable to confirm deletion. Please check the archive before trying again." };
  }

  const cleanup = await cleanEntryPhoto(supabase, snapshot);
  return { deleted: true, warning: cleanup.warning, cleanup };
}

// A reviewer's Take down: delete anyone's entry, then its photo. The database
// decides who is a reviewer; a non-reviewer's delete affects zero rows.
export async function reviewerDeleteEntry(supabase, id) {
  if (typeof id !== "string" || !isEntryId(id)) return { deleted: false, error: "This entry has an invalid ID and could not be deleted." };
  let snapshot;
  try {
    const { data: entry, error: loadError } = await supabase.from("entries").select("id, owner, image")
      .eq("id", id.toLowerCase()).maybeSingle();
    if (loadError || entry?.id !== id.toLowerCase()) {
      return { deleted: false, error: "Unable to load this entry. Please refresh and try again." };
    }
    snapshot = { id: entry.id, owner: entry.owner, image: entry.image };

    let request = supabase.from("entries").delete().eq("id", entry.id);
    request = entry.image == null ? request.is("image", null) : request.eq("image", entry.image);
    const { data, error } = await request.select("id, owner").maybeSingle();
    if (error || data?.id !== entry.id) {
      return { deleted: false, error: "This entry was not taken down. It may have changed, or you may no longer be a reviewer." };
    }
  } catch {
    return { deleted: false, error: "Unable to confirm the take down. Please check the archive before trying again." };
  }

  const cleanup = await cleanEntryPhoto(supabase, snapshot);
  return { deleted: true, warning: cleanup.warning, cleanup };
}
