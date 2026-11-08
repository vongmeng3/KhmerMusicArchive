"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { reviewerDeleteEntry } from "../lib/entry-deletion.js";
import { useArchiveUser } from "../lib/use-archive-user.js";

// Reviewers only: delete a published entry and its photo for good. Hiding the
// button is politeness; the database's delete policies refuse non-reviewers.
export default function ReviewerTakeDown({ id, title }) {
  const router = useRouter();
  const { user, supabase } = useArchiveUser();
  const busy = useRef(false);
  const [isReviewer, setIsReviewer] = useState(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) {
      setIsReviewer(false);
      return;
    }
    let active = true;
    supabase.rpc("is_reviewer")
      .then(({ data }) => { if (active) setIsReviewer(data === true); })
      .catch(() => { if (active) setIsReviewer(false); });
    return () => { active = false; };
  }, [supabase, user?.id]);

  async function handleTakeDown() {
    if (busy.current || finished) return;
    if (!window.confirm(`Take down “${title || "this entry"}”? It will be deleted for good, with its photo. This cannot be undone.`)) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    const result = await reviewerDeleteEntry(supabase, id);
    busy.current = false;
    setPending(false);
    if (!result.deleted) {
      setMessage(result.error);
      return;
    }
    setFinished(true);
    if (result.warning) {
      setMessage("Taken down. The entry is deleted, but its photo could not be removed from Storage.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!isReviewer) return null;

  return (
    <div style={{ margin: "0 0 24px" }}>
      <button type="button" onClick={handleTakeDown} disabled={pending || finished}
        style={{ padding: "6px 12px", color: "#E2B76D", background: "rgba(226, 183, 109, 0.08)", border: "1px solid rgba(226, 183, 109, 0.4)", borderRadius: 8, fontSize: 14, cursor: pending || finished ? "default" : "pointer" }}>
        {finished ? "Taken down" : pending ? "Taking down..." : "Take down / ដកចេញ"}
      </button>
      {message && <p role={finished ? "status" : "alert"} style={{ color: finished ? "#E2B76D" : "#FFB3B3", fontSize: 14, lineHeight: 1.5 }}>{message}</p>}
    </div>
  );
}
