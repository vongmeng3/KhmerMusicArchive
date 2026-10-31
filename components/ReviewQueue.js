"use client";

import { useState } from "react";
import ReviewQueueItem from "./ReviewQueueItem.js";
import { styles } from "../lib/entry-form-styles.js";
import { createClient } from "../lib/supabase/client.js";

// The pending entries the server loaded, oldest first. Each decision goes
// through review_entry in the browser; a reviewed entry leaves the list.
export default function ReviewQueue({ initialEntries }) {
  const [supabase] = useState(() => createClient());
  const [entries, setEntries] = useState(initialEntries);

  function removeReviewed(id) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  if (entries.length === 0) {
    return (
      <div style={styles.loginPrompt}>
        <p className="english-text" style={styles.loginMessage}>Nothing is waiting for review.</p>
        <p className="khmer-text" style={styles.loginMessage}>មិនមានការចូលរួមណាមួយកំពុងរង់ចាំការពិនិត្យទេ។</p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {entries.map((entry) => (
        <ReviewQueueItem key={entry.id} entry={entry} supabase={supabase} onReviewed={removeReviewed} />
      ))}
    </ul>
  );
}
