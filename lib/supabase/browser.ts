import { createClient } from "@supabase/supabase-js";
import { getBrowserEnv, inspectEnvReadiness } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function canCreateBrowserSupabaseClient(): boolean {
  return inspectEnvReadiness().browserReady;
}

export function getSupabaseBrowserClient() {
  const env = getBrowserEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
