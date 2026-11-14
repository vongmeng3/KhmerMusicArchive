"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { entryHref } from "../lib/entry-slugs.js";
import { styles } from "../lib/entry-form-styles.js";
import { entryFormValues, saveEntryEdit } from "../lib/entry-editing.js";
import EntryEditFields from "./EntryEditFields.js";
import EntryPhotoField from "./EntryPhotoField.js";

export default function EntryEditForm({ entry, supabase }) {
  const router = useRouter();
  const saving = useRef(false);
  const [form, setForm] = useState(() => entryFormValues(entry));
  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await saveEntryEdit(supabase, entry, form, photo);
      setErrors(result.errors || {});
      if (result.error) {
        setMessage(result.error);
        return;
      }
      router.replace(entryHref(result.entry));
      router.refresh();
    } catch {
      setMessage("Unable to finish saving. Please check the entry before trying again. មិនអាចរក្សាទុកបានចប់សព្វគ្រប់ទេ។ សូមពិនិត្យការចូលរួម មុនពេលព្យាយាមម្តងទៀត។");
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {message && <div role="alert" style={styles.message}>{message}</div>}
      <EntryEditFields form={form} errors={errors} onChange={updateField} disabled={submitting} />
      <EntryPhotoField entry={entry} error={errors.photo} disabled={submitting} onChange={(file) => {
        setPhoto(file);
        setErrors((current) => ({ ...current, photo: "" }));
        setMessage("");
      }} />
      <button type="submit" disabled={submitting} style={{ ...styles.submitButton, ...(submitting ? styles.submitButtonDisabled : {}) }}>
        {submitting ? "Saving..." : "Save changes / រក្សាទុក"}
      </button>
      <Link href={entryHref(entry)} style={{ display: "inline-block", marginTop: 16, color: "#2EE6A8", pointerEvents: submitting ? "none" : undefined }} aria-disabled={submitting}>Cancel</Link>
    </form>
  );
}
