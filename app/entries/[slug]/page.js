import Link from "next/link";
import EntryDetail from "../../../components/EntryDetail.js";
import PrivateEntry from "../../../components/PrivateEntry.js";
import ReviewerTakeDown from "../../../components/ReviewerTakeDown.js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server.js";
import { styles } from "../../../lib/entry-detail-styles.js";
import { entryHref, findEntryBySlug, isEntryId } from "../../../lib/entry-slugs.js";

export default async function EntryDetailPage({ params, searchParams }) {
  const { slug, id } = await params;
  const search = await searchParams;
  const query = typeof search?.q === "string" ? search.q : "";
  if (id && !isEntryId(id)) notFound();

  const supabase = await createClient();
  const request = supabase.from("entries").select("*");
  const { data, error } = id
    ? await request.eq("id", id).maybeSingle()
    : await request.order("created_at", { ascending: true });
  if (error) {
    return (
      <main className="entry-detail-page" style={styles.page}>
        <Link href="/" style={styles.back}>← Back to Browse</Link>
        <p role="alert" style={styles.text}>Unable to load this entry. Please try again later. មិនអាចផ្ទុកការចូលរួមនេះបានទេ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។</p>
      </main>
    );
  }

  const found = id ? data : findEntryBySlug(data || [], slug);
  if (!found && !id) notFound();
  // The server now reads with the visitor's login, so it can find their own
  // unpublished entries too. Only published rows go straight to the page.
  const row = found?.status === "published" ? found : null;
  if (!id) {
    redirect(`${entryHref(found)}${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  return (
    <main className="entry-detail-page" style={styles.page}>
      <Link href="/" style={styles.back}>← Back to Browse</Link>
      {/* row is only ever a published entry here. */}
      {row && <ReviewerTakeDown id={row.id} title={row.title_en || row.title_kh} />}
      {/* Not published: only the owner or a reviewer can see it, in the browser. */}
      {row ? <EntryDetail row={row} query={query} /> : <PrivateEntry id={id} query={query} />}
    </main>
  );
}
