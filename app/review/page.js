import Link from "next/link";
import ReviewQueue from "../../components/ReviewQueue.js";
import { styles } from "../../lib/entry-form-styles.js";
import { createClient } from "../../lib/supabase/server.js";

// Runs on the server, before any entries load. Hiding this page is politeness.
// The database is the gate: review_entry refuses anyone who is not a reviewer.
async function loadQueue() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { view: "login" };

  const { data: isReviewer, error: checkError } = await supabase.rpc("is_reviewer");
  if (checkError) return { view: "error" };
  if (isReviewer !== true) return { view: "forbidden" };

  const { data, error } = await supabase.from("entries")
    .select("id, title_en, title_kh, contributor_en, contributor_kh, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return { view: "error" };
  return { view: "queue", entries: data || [] };
}

export default async function ReviewPage() {
  const queue = await loadQueue();

  let content;
  if (queue.view === "login") {
    content = <div style={styles.loginPrompt}>
      <p role="alert" style={styles.loginMessage}>Please log in to review entries. សូមចូលគណនី ដើម្បីពិនិត្យការចូលរួម។</p>
      <Link href="/login" style={styles.loginButton}>Log in</Link>
    </div>;
  } else if (queue.view === "error") {
    content = <p role="alert" style={styles.message}>Unable to load the review queue. Please try again. មិនអាចផ្ទុកជួរការពិនិត្យបានទេ។ សូមព្យាយាមម្តងទៀត។</p>;
  } else if (queue.view === "forbidden") {
    content = <div role="alert" style={styles.message}>
      <p className="english-text" style={{ margin: 0 }}>Only reviewers can open the review queue.</p>
      <p className="khmer-text" style={{ margin: "4px 0 0" }}>មានតែអ្នកពិនិត្យប៉ុណ្ណោះដែលអាចបើកជួរការពិនិត្យនេះបាន។</p>
    </div>;
  } else {
    content = <ReviewQueue initialEntries={queue.entries} />;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <Link href="/" style={{ color: "#2EE6A8", display: "inline-block", marginBottom: 24, textDecoration: "none" }}>← Back to Browse</Link>
        <div style={styles.kicker}>REVIEW QUEUE / ការពិនិត្យ</div>
        <h1 style={styles.title}>Waiting for review</h1>
        <p style={styles.description}>Oldest first. Open an entry to read it before you decide.</p>
        <div style={styles.card}>{content}</div>
      </div>
    </main>
  );
}
