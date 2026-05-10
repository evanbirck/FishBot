import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase browser environment is not configured.");
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
