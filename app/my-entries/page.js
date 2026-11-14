"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { entryHref } from "../../lib/entry-slugs.js";
import { styles } from "../../lib/entry-form-styles.js";
import { RETURNED_HINT, STATUS_LABELS } from "../../lib/entry-status.js";
import { useArchiveUser } from "../../lib/use-archive-user.js";

const listStyles = {
  item: { padding: "16px 0", borderBottom: "1px solid rgba(226, 183, 109, 0.2)" },
  title: { color: "#F4F0E8", fontSize: 18, fontWeight: 700, textDecoration: "none" },
  status: { margin: "6px 0 0", color: "#97A1B3", fontSize: 14 },
  returned: { margin: "10px 0 0", padding: "10px 12px", color: "#E2B76D", fontSize: 14, lineHeight: 1.5, border: "1px solid rgba(226, 183, 109, 0.35)", borderRadius: 8 },
  edit: { color: "#2EE6A8", fontWeight: 700, textDecoration: "none" },
};

export default function MyEntriesPage() {
  const { user, loading, supabase } = useArchiveUser();
  const [record, setRecord] = useState({ entries: [], loading: true, error: "" });

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase.from("entries").select("id, title_en, title_kh, status")
      .eq("owner", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (active) setRecord({ entries: data || [], loading: false, error: error ? "Unable to load your entries. Please try again. មិនអាចផ្ទុកការចូលរួមរបស់អ្នកបានទេ។ សូមព្យាយាមម្តងទៀត។" : "" });
      });
    return () => { active = false; };
  }, [supabase, user?.id]);

  let content;
  if (loading) {
    content = <p style={styles.description}>Checking your account...</p>;
  } else if (!user) {
    content = <div style={styles.loginPrompt}>
      <p role="alert" style={styles.loginMessage}>Please log in to see your entries. សូមចូលគណនី ដើម្បីមើលការចូលរួមរបស់អ្នក។</p>
      <Link href="/login" style={styles.loginButton}>Log in</Link>
    </div>;
  } else if (record.loading) {
    content = <p style={styles.description}>Loading your entries...</p>;
  } else if (record.error) {
    content = <p role="alert" style={styles.message}>{record.error}</p>;
  } else if (record.entries.length === 0) {
    content = <div style={styles.loginPrompt}>
      <p className="english-text" style={styles.loginMessage}>You have not contributed any entries yet.</p>
      <p className="khmer-text" style={styles.loginMessage}>អ្នកមិនទាន់បានចូលរួមចំណែកធាតុណាមួយនៅឡើយទេ។</p>
      <Link href="/contribute" style={styles.loginButton}>Contribute / ចូលរួមចំណែក</Link>
    </div>;
  } else {
    content = <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {record.entries.map((entry) => (
        <li key={entry.id} style={listStyles.item}>
          <Link href={entryHref(entry)} style={listStyles.title}>
            <span className="khmer-title">{entry.title_kh}</span>{entry.title_kh && entry.title_en && " / "}<span className="english-text">{entry.title_en}</span>
          </Link>
          <p style={listStyles.status}>{STATUS_LABELS[entry.status] || entry.status}</p>
          {entry.status === "returned" && <div style={listStyles.returned}>
            <p className="english-text" style={{ margin: 0 }}>{RETURNED_HINT.en}</p>
            <p className="khmer-text" style={{ margin: "4px 0 8px" }}>{RETURNED_HINT.kh}</p>
            <Link href={`${entryHref(entry)}/edit`} style={listStyles.edit}>Edit and resend / កែប្រែ ហើយផ្ញើម្តងទៀត</Link>
          </div>}
        </li>
      ))}
    </ul>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <Link href="/" style={{ color: "#2EE6A8", display: "inline-block", marginBottom: 24, textDecoration: "none" }}>← Back to Browse</Link>
        <div style={styles.kicker}>MY ENTRIES / ការចូលរួមរបស់ខ្ញុំ</div>
        <h1 style={styles.title}>My entries</h1>
        <div style={styles.card}>{content}</div>
      </div>
    </main>
  );
}
