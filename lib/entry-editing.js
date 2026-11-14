import { getYouTubeId, validateEntry } from "./entry-validation.js";

// Only these columns can be edited. Never copy owner or id from form input.
const EDITABLE_FIELDS = [
  "title_en", "title_kh", "type", "description_en", "description_kh",
  "contributor_en", "contributor_kh", "place_en", "place_kh", "youtube_url",
];

export function entryFormValues(entry) {
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, entry[field] ?? ""]));
}

export async function saveEntryEdit(supabase, entry, form, photo) {
  let uploadedPath = null;
  let saved = false;
  try {
    const errors = validateEntry(form, photo, entry.image || "");
    if (Object.keys(errors).length) return { errors, error: "Please correct the highlighted fields. សូមកែតម្រូវវាលដែលបានសម្គាល់។" };

    // Check the current account again: it may have changed since the form loaded.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== entry.owner) {
      return { error: "Only the entry's owner can save changes. Please log in with that account. មានតែម្ចាស់ការចូលរួមប៉ុណ្ណោះដែលអាចរក្សាទុកការកែប្រែបាន។ សូមចូលដោយប្រើគណនីនោះ។" };
    }

    const updates = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, form[field].trim()]));
    const youtubeId = updates.youtube_url ? getYouTubeId(updates.youtube_url) : null;
    updates.youtube_url = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;

    if (photo) {
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[photo.type];
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("photos").upload(path, photo, { contentType: photo.type, upsert: false });
      if (error) return { error: "The replacement photo could not be uploaded. Please try again. មិនអាចផ្ទុករូបថតថ្មីឡើងបានទេ។ សូមព្យាយាមម្តងទៀត។" };
      uploadedPath = path;
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      if (!data.publicUrl?.trim()) return { error: "The replacement photo is unavailable. Please try again. រូបថតថ្មីមិនអាចប្រើបានទេ។ សូមព្យាយាមម្តងទៀត។" };
      updates.image = data.publicUrl.trim();
    }

    // A non-reviewer's edit goes back to review. Anything but a clear true (including an error) counts as non-reviewer.
    const { data: isReviewer } = await supabase.rpc("is_reviewer");
    if (isReviewer !== true) updates.status = "pending";

    const { data, error } = await supabase.from("entries")
      .update(updates)
      .eq("id", entry.id)
      .eq("owner", user.id)
      .select("id")
      .maybeSingle();

    // RLS can reject an update by affecting zero rows without returning an error.
    if (error || !data?.id) {
      return { error: "Your changes were not saved. The entry may be unavailable or you may no longer have permission to edit it. ការកែប្រែរបស់អ្នកមិនត្រូវបានរក្សាទុកទេ។ ការចូលរួមនេះប្រហែលជាមិនអាចប្រើបាន ឬអ្នកលែងមានសិទ្ធិកែប្រែវាហើយ។" };
    }
    saved = true;
    return { entry: { ...entry, ...updates, id: data.id } };
  } catch {
    return { error: "Unable to save your changes. Please check your connection and try again. មិនអាចរក្សាទុកការកែប្រែរបស់អ្នកបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។" };
  } finally {
    if (uploadedPath && !saved) {
      try {
        await supabase.storage.from("photos").remove([uploadedPath]);
      } catch {
        // A failed cleanup must not turn a failed save into a success.
      }
    }
  }
}
