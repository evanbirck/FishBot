import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
type CookieStore = Awaited<ReturnType<typeof cookies>>;

export async function createClient(cookieStore?: CookieStore) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment is not configured.");
  }
  const resolvedCookieStore = cookieStore ?? (await cookies());

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return resolvedCookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => resolvedCookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies directly. Middleware refreshes auth sessions.
        }
      }
    }
  });
}
