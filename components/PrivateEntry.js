"use client";

import { useEffect, useState } from "react";
import { styles } from "../lib/entry-detail-styles.js";
import { RETURNED_HINT, STATUS_LABELS } from "../lib/entry-status.js";
import { useArchiveUser } from "../lib/use-archive-user.js";
import EntryDetail from "./EntryDetail.js";

// The server page loads entries without the visitor's login, so it only finds
// published ones. Ask again with the login: row-level security lets the owner
// see their own entry and a reviewer see any entry. Everyone else gets nothing.
export default function PrivateEntry({ id, query }) {
  const { user, loading, supabase } = useArchiveUser();
  const [record, setRecord] = useState({ row: null, userId: null, loading: true, error: "" });

  useEffect(() => {
    if (!user) return;
    let active = true;
    setRecord({ row: null, userId: user.id, loading: true, error: "" });
    supabase.from("entries").select("*").eq("id", id).maybeSingle()
      .then(({ data, error }) => {
        if (active) setRecord({ row: data, userId: user.id, loading: false, error: error ? "Unable to load this entry. Please try again later. មិនអាចផ្ទុកការចូលរួមនេះបានទេ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។" : "" });
      });
    return () => { active = false; };
  }, [id, supabase, user?.id]);

  if (loading || (user && (record.loading || record.userId !== user.id))) {
    return <p style={styles.text}>Loading entry...</p>;
  }
  if (record.error) {
    return <p role="alert" style={styles.text}>{record.error}</p>;
  }
  if (!user || !record.row) {
    return <p role="alert" style={styles.text}>This entry is not available. It may be waiting for review, or it may have been removed. ការចូលរួមនេះមិនអាចមើលបានទេ។ វាប្រហែលជាកំពុងរង់ចាំការពិនិត្យ ឬត្រូវបានដកចេញហើយ។</p>;
  }

  return (
    <>
      <p role="status" style={{ ...styles.label, marginTop: 0, marginBottom: 16 }}>{STATUS_LABELS[record.row.status] || record.row.status}</p>
      {record.row.status === "returned" && record.row.owner === user.id && <div style={{ ...styles.text, marginBottom: 16 }}>
        <p className="english-text" style={{ margin: 0 }}>{RETURNED_HINT.en}</p>
        <p className="khmer-text" style={{ margin: "4px 0 0" }}>{RETURNED_HINT.kh}</p>
      </div>}
      <EntryDetail row={record.row} query={query} />
    </>
  );
}
