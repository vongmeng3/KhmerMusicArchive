"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEntry } from "../lib/entry-deletion.js";
import EntryPhotoCleanup from "./EntryPhotoCleanup.js";

export default function EntryDeleteButton({ id, owner, title, supabase, onDeleted }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  const [cleanup, setCleanup] = useState(null);

  async function handleDelete() {
    if (busy.current || finished) return;
    if (!window.confirm(`Delete “${title || "this entry"}”? This cannot be undone.`)) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    let outcome;
    try {
      outcome = await deleteEntry(supabase, id, owner);
      if (!outcome.deleted) {
        setMessage(outcome.error);
        return;
      }
      setFinished(true);
      setMessage(outcome.warning || "Entry deleted.");
      onDeleted();
      if (outcome.cleanup.status === "failed") {
        setCleanup(outcome.cleanup.snapshot);
        return;
      }
      window.alert("Entry deleted.");
      router.replace("/");
      router.refresh();
    } catch {
      setMessage(outcome?.deleted
        ? `${outcome.warning || "The entry was deleted."} Please return to the archive using the link below.`
        : "Unable to confirm deletion. Please check the archive before trying again. មិនអាចបញ្ជាក់ការលុបបានទេ។ សូមពិនិត្យបណ្ណសារ មុនពេលព្យាយាមម្តងទៀត។");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (cleanup) return <EntryPhotoCleanup supabase={supabase} snapshot={cleanup} />;

  return (
    <div>
      <button type="button" onClick={handleDelete} disabled={pending || finished}
        style={{ padding: "6px 12px", color: "#FFB3B3", background: "rgba(255, 138, 138, 0.08)", border: "1px solid rgba(255, 138, 138, 0.25)", borderRadius: 8, fontSize: 14, cursor: pending || finished ? "default" : "pointer" }}>
        {finished ? "Deleted" : pending ? "Deleting..." : "Delete / លុប"}
      </button>
      {message && <p role={finished ? "status" : "alert"} style={{ color: finished ? "#E2B76D" : "#FFB3B3", fontSize: 14, lineHeight: 1.5 }}>{message}</p>}
      {finished && <Link href="/" style={{ color: "#2EE6A8", fontSize: 14 }}>Return to archive</Link>}
    </div>
  );
}
