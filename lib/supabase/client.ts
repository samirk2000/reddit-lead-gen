"use client";

import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/lib/supabase/types";

/**
 * Creates a Supabase client for use in Client Components.
 *
 * This client is rendered in the browser and relies on the automatic cookie
 * handling provided by `@supabase/ssr`. It must only be called from the client
 * side (see the `"use client"` directive above). Never expose the service role
 * key here.
 */
export function createClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase client keys are missing. Ensure NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local",
    );
  }

  return createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
  ) as unknown as SupabaseClient<Database>;
}
