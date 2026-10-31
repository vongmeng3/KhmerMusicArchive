"use client";

import Link from "next/link";
import { useState } from "react";
import { entryHref } from "../lib/entry-slugs.js";

const itemStyles = {
  item: { padding: "18px 0", borderBottom: "1px solid rgba(226, 183, 109, 0.2)" },
  title: { color: "#F4F0E8", fontSize: 18, fontWeight: 700, textDecoration: "none" },
  meta: { margin: "6px 0 12px", color: "#97A1B3", fontSize: 14 },
  actions: { display: "flex", flexWrap: "wrap", gap: 10 },
  publish: { padding: "9px 16px", color: "#14181F", background: "#2EE6A8", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" },
  ret: { padding: "9px 16px", color: "#E2B76D", background: "transparent", border: "1px solid rgba(226, 183, 109, 0.5)", borderRadius: 8, fontWeight: 700, cursor: "pointer" },
  error: { margin: "10px 0 0", color: "#FF8A8A", fontSize: 14 },
};

// Failure messages in both languages, like the rest of the archive.
const MESSAGES = {
  refused: {
    en: "This entry was not updated. It may already have been reviewed, or you may no longer be a reviewer.",
    kh: "ការចូលរួមនេះមិនត្រូវបានកែប្រែទេ។ វាប្រហែលជាត្រូវបានពិនិត្យរួចហើយ ឬអ្នកប្រហែលជាលែងជាអ្នកពិនិត្យហើយ។",
  },
  offline: {
    en: "Unable to save the decision. Please check your connection and try again.",
    kh: "មិនអាចរក្សាទុកការសម្រេចចិត្តបានទេ។ សូមពិនិត្យការតភ្ជាប់របស់អ្នក ហើយព្យាយាមម្តងទៀត។",
  },
};

// One pending entry with the reviewer's two decisions. The database function
// review_entry is the real check: it refuses non-reviewers and non-pending entries.
export default function ReviewQueueItem({ entry, supabase, onReviewed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function review(decision) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("review_entry", { entry_id: entry.id, decision });
      if (rpcError || data !== true) {
        setError(MESSAGES.refused);
        setBusy(false);
        return;
      }
      onReviewed(entry.id);
    } catch {
      setError(MESSAGES.offline);
      setBusy(false);
    }
  }

  return (
    <li style={itemStyles.item}>
      <Link href={entryHref(entry)} style={itemStyles.title}>
        <span className="khmer-title">{entry.title_kh}</span>{entry.title_kh && entry.title_en && " / "}<span className="english-text">{entry.title_en}</span>
      </Link>
      <p style={itemStyles.meta}>
        <span className="khmer-contributor">{entry.contributor_kh}</span>{entry.contributor_kh && entry.contributor_en && " / "}<span className="english-text">{entry.contributor_en}</span>
        {" · "}Submitted {new Date(entry.created_at).toLocaleDateString("en-GB")}
      </p>
      <div style={itemStyles.actions}>
        <button type="button" style={itemStyles.publish} disabled={busy} onClick={() => review("published")}>Publish / ផ្សព្វផ្សាយ</button>
        <button type="button" style={itemStyles.ret} disabled={busy} onClick={() => review("returned")}>Return / ប្រគល់ត្រឡប់</button>
      </div>
      {error && <div role="alert" style={itemStyles.error}>
        <p className="english-text" style={{ margin: 0 }}>{error.en}</p>
        <p className="khmer-text" style={{ margin: "4px 0 0" }}>{error.kh}</p>
      </div>}
    </li>
  );
}
