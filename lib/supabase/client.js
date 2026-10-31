import { createBrowserClient } from "@supabase/ssr";

// Keeps the login in cookies (not localStorage) so server pages can see it too.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
