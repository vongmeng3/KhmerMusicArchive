"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import collection from "../collection.config.js";
import { createClient } from "../lib/supabase/client.js";
import ReviewerNavLink from "./ReviewerNavLink.js";

const accountStyles = {
  wrap: { position: "relative" },
  button: { display: "grid", placeItems: "center", width: 36, height: 36, padding: 0, color: "#d7c8ff", background: "rgba(126, 81, 255, .18)", border: "1px solid rgba(173, 135, 255, .65)", borderRadius: "50%", cursor: "pointer", fontSize: 18 },
  menu: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 10, minWidth: 190, padding: 8, background: "#1C222C", border: "1px solid rgba(226, 183, 109, 0.28)", borderRadius: 10, boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)" },
  item: { display: "block", width: "100%", boxSizing: "border-box", padding: "9px 10px", color: "#E8EDF2", background: "transparent", border: 0, borderRadius: 6, fontSize: 13, textAlign: "left", textDecoration: "none", cursor: "pointer" },
  email: { display: "block", maxWidth: 230, padding: "7px 10px 9px", overflow: "hidden", color: "#97A1B3", fontSize: 12, textOverflow: "ellipsis", whiteSpace: "nowrap" },
};

export default function ArchiveNav({ current = "archive" }) {
  const [user, setUser] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (isMounted) setUser(currentUser);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    await createClient().auth.signOut();
    setUser(null);
    setIsAccountMenuOpen(false);
    setIsLoggingOut(false);
  }

  return (
    <nav className="archive-nav" aria-label="Primary navigation">
      <Link className="archive-brand" href="/" aria-label={`${collection.name} home`}>
        <span className="archive-brand-mark" aria-hidden="true">♫</span>
        <span>
          <strong>{collection.name}</strong>
          <small>Living cultural archive</small>
        </span>
      </Link>
      <div className="archive-nav-links">
        <Link className={`archive-nav-link ${current === "archive" ? "is-active" : ""}`} href="/" aria-current={current === "archive" ? "page" : undefined}>Archive</Link>
        <Link className="archive-nav-link" href="/#collection">Collection</Link>
        <Link className="archive-nav-link" href="/#about">About</Link>
        <Link className={`archive-nav-link ${current === "contribute" ? "is-active" : ""}`} href="/contribute" aria-current={current === "contribute" ? "page" : undefined}>Contribute</Link>
        {user && <Link className="archive-nav-link" href="/my-entries">My entries / ការចូលរួមរបស់ខ្ញុំ</Link>}
        {user && <ReviewerNavLink userId={user.id} />}
        <div style={accountStyles.wrap}>
          <button
            type="button"
            style={accountStyles.button}
            onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
            aria-label="Account menu"
            aria-expanded={isAccountMenuOpen}
            aria-haspopup="menu"
          >
            <img
              src="/icons/account.png"
              alt=""
              width="20"
              height="20"
              style={{ filter: "invert(1) brightness(0.9)" }}
            />
          </button>
          {isAccountMenuOpen && (
            <div style={accountStyles.menu} role="menu">
              {user ? (
                <>
                  <span style={accountStyles.email} title={user.email}>{user.email}</span>
                  <button type="button" style={accountStyles.item} onClick={handleLogout} disabled={isLoggingOut} role="menuitem">
                    {isLoggingOut ? "Logging out..." : "Log out"}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" style={accountStyles.item} role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>Log in</Link>
                  <Link href="/signup" style={accountStyles.item} role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>Sign up</Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}