import { createClient } from "@supabase/supabase-js";

let supabase;

export function createSupabaseBrowserClient() {
  if (supabase) {
    return supabase;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  supabase = createClient(url, publishableKey);
  return supabase;
}
