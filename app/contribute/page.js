"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "../../lib/supabase/client.js";

import { styles } from "../../lib/entry-form-styles.js";
import { ALLOWED_TYPES, MAX_FILE_SIZE, MAX_TITLE_LENGTH, getYouTubeId, validateEntry, entryWarnings } from "../../lib/entry-validation.js";

// Same back link as the review page, so every view can return home.
const backLink = (
  <Link href="/" style={{ color: "#2EE6A8", display: "inline-block", marginBottom: 24, textDecoration: "none" }}>
    ← Back to Browse
  </Link>
);

export default function ContributePage() {
  const [supabase] = useState(() => createClient());

  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [form, setForm] = useState({
    title_en: "",
    title_kh: "",
    type: "",
    description_en: "",
    description_kh: "",
    contributor_en: "",
    contributor_kh: "",
    place_en: "",
    place_kh: "",
    youtube_url: "",
  });

  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (mounted) {
        setUser(user);
        setLoadingUser(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: "",
    }));

    setSubmitError("");
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] ?? null;

    setPhoto(file);
    setErrors((current) => ({
      ...current,
      photo: "",
    }));
    setSubmitError("");

    if (!file) {
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrors((current) => ({
        ...current,
        photo: "Please choose a JPG, PNG, or WebP image. សូមជ្រើសរើសរូបភាព JPG, PNG ឬ WebP។",
      }));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrors((current) => ({
        ...current,
        photo: "The image must be 5 MB or smaller. រូបភាពត្រូវមានទំហំមិនលើសពី 5 MB។",
      }));
    }
  }

  function validate() {
    const nextErrors = validateEntry(form, photo);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  const warnings = entryWarnings(form);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");

    if (!validate()) {
      return;
    }

    if (!user) {
      setSubmitError("Please log in before contributing an entry.");
      return;
    }

    setSubmitting(true);
    let uploadedPath = null;

    try {
      const extension =
        photo.type === "image/jpeg"
          ? "jpg"
          : photo.type === "image/png"
            ? "png"
            : "webp";

      const randomName =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      uploadedPath = `${user.id}/${randomName}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(uploadedPath, photo, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Photo upload failed:", uploadError);
        throw new Error("PHOTO_UPLOAD_FAILED");
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("photos")
        .getPublicUrl(uploadedPath);

      const titleEn = form.title_en.trim();

      // Store a clean, normalized YouTube link (or null if left blank)
      const youtubeId = form.youtube_url.trim()
        ? getYouTubeId(form.youtube_url)
        : null;

      const { data: insertedEntry, error: insertError } = await supabase
        .from("entries")
        .insert({
          owner: user.id,
          title_en: titleEn,
          title_kh: form.title_kh.trim(),
          type: form.type.trim(),
          description_en: form.description_en.trim(),
          description_kh: form.description_kh.trim(),
          contributor_en: form.contributor_en.trim(),
          contributor_kh: form.contributor_kh.trim(),
          place_en: form.place_en.trim(),
          place_kh: form.place_kh.trim(),
          image: publicUrl,
          youtube_url: youtubeId
            ? `https://www.youtube.com/watch?v=${youtubeId}`
            : null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Supabase entry insert failed:", insertError);

        await supabase.storage.from("photos").remove([uploadedPath]);

        throw new Error(`ENTRY_SAVE_FAILED: ${insertError.message}`);
      }

      if (!insertedEntry?.id) {
        console.error("Entry was inserted without returning an id.");
        throw new Error("ENTRY_ID_MISSING");
      }

      // New entries start as pending (database default), so stay here and explain that.
      setSubmitted(true);
    } catch (error) {
      console.error("Contribution failed:", error);

      setSubmitError(
        error?.message === "PHOTO_UPLOAD_FAILED"
          ? "The photo could not be uploaded. Please check the file and try again."
          : error?.message?.startsWith("ENTRY_SAVE_FAILED:")
            ? error.message
            : "Something went wrong while saving your contribution. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingUser) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <p style={styles.description}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          {backLink}
          <div style={styles.kicker}>CONTRIBUTE</div>
          <h1 style={styles.title}>Add to the archive</h1>

          <div style={styles.card}>
            <div style={styles.loginPrompt}>
              <p style={styles.loginMessage}>
                You need to be logged in before you can contribute an entry.
              </p>
              <a href="/login" style={styles.loginButton}>
                Log in
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          {backLink}
          <div style={styles.kicker}>CONTRIBUTE / ចូលរួមចំណែក</div>
          <h1 style={styles.title}>Add to the archive</h1>

          <div role="status" style={styles.card}>
            <p className="english-text" style={styles.loginMessage}>
              Thank you. Your entry is waiting for review. You can see it under My entries, and it will appear in the archive once it&apos;s published.
            </p>
            <p className="khmer-text" style={styles.loginMessage}>
              សូមអរគុណ។ ការចូលរួមរបស់អ្នកកំពុងរង់ចាំការពិនិត្យ។ អ្នកអាចមើលវានៅក្នុង «ការចូលរួមរបស់ខ្ញុំ» ហើយវានឹងបង្ហាញក្នុងបណ្ណសារ នៅពេលដែលវាត្រូវបានផ្សព្វផ្សាយ។
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {backLink}
        <div style={styles.kicker}>CONTRIBUTE / ចូលរួមចំណែក</div>

        <h1 style={styles.title}>Add to the archive</h1>

        <p style={styles.description}>
          Share a Khmer traditional music entry with the archive.
          Add accurate information in English and Khmer, along with a clear photo.
        </p>

        <div style={styles.card}>
          {submitError && (
            <div role="alert" style={styles.message}>
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <h2 style={styles.sectionTitle}>Entry Information / ព័ត៌មានអំពីធាតុ</h2>

            <div style={styles.field}>
              <label htmlFor="title_en" style={styles.label}>
                Title (English) *
              </label>
              <input
                id="title_en"
                name="title_en"
                required
                aria-invalid={Boolean(errors.title_en)}
                aria-describedby={errors.title_en ? "title_en-error" : undefined}
                type="text"
                value={form.title_en}
                onChange={(e) => updateField("title_en", e.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                style={styles.input}
                disabled={submitting}
                lang="en"
                placeholder="Please enter the title in English"
              />
              <small style={styles.help}>
                Maximum {MAX_TITLE_LENGTH.toLocaleString()} characters.
              </small>
              {errors.title_en && (
                <div id="title_en-error" role="alert" style={styles.error}>{errors.title_en}</div>
              )}
              {!errors.title_en && warnings.title_en && (
                <div role="status" style={styles.warning}>{warnings.title_en}</div>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="title_kh" style={styles.label}>
                ចំណងជើង (ខ្មែរ) *
              </label>
              <input
                id="title_kh"
                name="title_kh"
                required
                aria-invalid={Boolean(errors.title_kh)}
                aria-describedby={errors.title_kh ? "title_kh-error" : undefined}
                type="text"
                value={form.title_kh}
                onChange={(e) => updateField("title_kh", e.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                style={styles.input}
                disabled={submitting}
                placeholder="សូមបញ្ចូលចំណងជើងជាភាសាខ្មែរ"
                lang="km"
              />
              {errors.title_kh && (
                <div id="title_kh-error" role="alert" style={styles.error}>{errors.title_kh}</div>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="type" style={styles.label}>
                Type / ប្រភេទ *
              </label>
              <select
                id="type"
                name="type"
                value={form.type}
                onChange={(event) => updateField("type", event.target.value)}
                style={styles.select}
                disabled={submitting}
              >
                <option value="">Select a type / ជ្រើសរើសប្រភេទ</option>
                <option value="song">Song / ចម្រៀង</option>
                <option value="instrument">Instrument / ឧបករណ៍តន្ត្រី</option>
              </select>
              {errors.type && (
                <div style={styles.error}>{errors.type}</div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Story / រឿងរ៉ាវ</h2>

            <div style={styles.field}>
              <label htmlFor="description_en" style={styles.label}>
                Story / Description (English) *
              </label>
              <textarea
                id="description_en"
                name="description_en"
                required
                aria-invalid={Boolean(errors.description_en)}
                aria-describedby={errors.description_en ? "description_en-error" : undefined}
                value={form.description_en}
                onChange={(event) =>
                  updateField("description_en", event.target.value)
                }
                style={styles.textarea}
                disabled={submitting}
              />
              {errors.description_en && (
                <div id="description_en-error" role="alert" style={styles.error}>{errors.description_en}</div>
              )}
              {!errors.description_en && warnings.description_en && (
                <div role="status" style={styles.warning}>{warnings.description_en}</div>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="description_kh" style={styles.label}>
                រឿងរ៉ាវ / ការពិពណ៌នា (ខ្មែរ) *
              </label>
              <textarea
                id="description_kh"
                name="description_kh"
                required
                aria-invalid={Boolean(errors.description_kh)}
                aria-describedby={errors.description_kh ? "description_kh-error" : undefined}
                value={form.description_kh}
                onChange={(event) =>
                  updateField("description_kh", event.target.value)
                }
                style={styles.textarea}
                disabled={submitting}
              />
              {errors.description_kh && (
                <div id="description_kh-error" role="alert" style={styles.error}>{errors.description_kh}</div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Contributor / អ្នករួមចំណែក</h2>

            <div style={styles.field}>
              <label htmlFor="contributor_en" style={styles.label}>
                Contributor (English) *
              </label>
              <input
                id="contributor_en"
                name="contributor_en"
                required
                aria-invalid={Boolean(errors.contributor_en)}
                aria-describedby={errors.contributor_en ? "contributor_en-error" : undefined}
                type="text"
                value={form.contributor_en}
                onChange={(event) =>
                  updateField("contributor_en", event.target.value)
                }
                style={styles.input}
                disabled={submitting}
              />
              {errors.contributor_en && (
                <div id="contributor_en-error" role="alert" style={styles.error}>{errors.contributor_en}</div>
              )}
              {!errors.contributor_en && warnings.contributor_en && (
                <div role="status" style={styles.warning}>{warnings.contributor_en}</div>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="contributor_kh" style={styles.label}>
                អ្នករួមចំណែក (ខ្មែរ) *
              </label>
              <input
                id="contributor_kh"
                name="contributor_kh"
                required
                aria-invalid={Boolean(errors.contributor_kh)}
                aria-describedby={errors.contributor_kh ? "contributor_kh-error" : undefined}
                type="text"
                value={form.contributor_kh}
                onChange={(event) =>
                  updateField("contributor_kh", event.target.value)
                }
                style={styles.input}
                disabled={submitting}
              />
              {errors.contributor_kh && (
                <div id="contributor_kh-error" role="alert" style={styles.error}>{errors.contributor_kh}</div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Place / ទីកន្លែង</h2>

            <div style={styles.field}>
              <label htmlFor="place_en" style={styles.label}>
                Place (English) *
              </label>
              <input
                id="place_en"
                name="place_en"
                required
                aria-invalid={Boolean(errors.place_en)}
                aria-describedby={errors.place_en ? "place_en-error" : undefined}
                type="text"
                value={form.place_en}
                onChange={(event) => updateField("place_en", event.target.value)}
                style={styles.input}
                disabled={submitting}
              />
              {errors.place_en && (
                <div id="place_en-error" role="alert" style={styles.error}>{errors.place_en}</div>
              )}
              {!errors.place_en && warnings.place_en && (
                <div role="status" style={styles.warning}>{warnings.place_en}</div>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="place_kh" style={styles.label}>
                ទីកន្លែង (ខ្មែរ) *
              </label>
              <input
                id="place_kh"
                name="place_kh"
                required
                aria-invalid={Boolean(errors.place_kh)}
                aria-describedby={errors.place_kh ? "place_kh-error" : undefined}
                type="text"
                value={form.place_kh}
                onChange={(event) => updateField("place_kh", event.target.value)}
                style={styles.input}
                disabled={submitting}
              />
              {errors.place_kh && (
                <div id="place_kh-error" role="alert" style={styles.error}>{errors.place_kh}</div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Photo / រូបភាព</h2>

            <div style={styles.field}>
              <label htmlFor="photo" style={styles.label}>
                Photo / រូបភាព *
              </label>
              <input
                id="photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                style={styles.input}
                disabled={submitting}
              />
              <small style={styles.help}>
                JPG, PNG, or WebP only. Maximum 5 MB.
              </small>
              {errors.photo && (
                <div style={styles.error}>{errors.photo}</div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Video / វីដេអូ</h2>

            <div style={styles.field}>
              <label htmlFor="youtube_url" style={styles.label}>
                YouTube link (optional) / តំណ YouTube
              </label>
              <input
                id="youtube_url"
                name="youtube_url"
                type="url"
                value={form.youtube_url}
                onChange={(event) =>
                  updateField("youtube_url", event.target.value)
                }
                style={styles.input}
                disabled={submitting}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <small style={styles.help}>
                Optional. Paste a link to a performance or recording on YouTube.
              </small>
              {errors.youtube_url && (
                <div style={styles.error}>{errors.youtube_url}</div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                ...styles.submitButton,
                ...(submitting ? styles.submitButtonDisabled : {}),
              }}
            >
              {submitting ? "Saving..." : "Add to archive / បន្ថែមទៅបណ្ណសារ"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}