import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/lib/supabase/types";

/** Typed Supabase client created with the service role key. */
export type SupabaseServiceClient = SupabaseClient<Database>;

/**
 * Creates a Supabase client backed by the service role key.
 *
 * This client bypasses Row Level Security, so it must ONLY be used server-side
 * in trusted, non-user-facing code paths (cron jobs and the pipeline). Its key
 * must never be exposed to the client bundle.
 */
export function createServiceClient(): SupabaseServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are missing. " +
        "Check your .env.local",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
