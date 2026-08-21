import { cookies } from "next/headers";
import {
  createServerClient,
  type SetAllCookies,
  type GetAllCookies,
} from "@supabase/ssr";
import { type Database } from "@/lib/supabase/types";

/**
 * Creates a Supabase client for Server Components and Server Actions.
 *
 * Uses `@supabase/ssr` with the `cookies()` from `next/headers` so the session
 * cookie can be refreshed and persisted on the server. This function must run
 * exclusively server-side; it is not imported by any `"use client"` module.
 *
 * @param cookieStore The server `cookies()` handle from `next/headers`.
 */
export async function createClient(
  cookieStore: ReturnType<typeof cookies>,
): Promise<ReturnType<typeof createServerClient<Database>>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase server keys are missing. Ensure NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local",
    );
  }

  const getAllCookies: GetAllCookies = () => cookieStore.getAll();

  const setAllCookies: SetAllCookies = (cookiesToSet) => {
    try {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options),
      );
    } catch {
      // The `set` call runs during a Server Component render, where it is
      // not allowed. Safe to ignore because middleware refreshes the session
      // cookie automatically.
    }
  };

  const client = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: getAllCookies,
      setAll: setAllCookies,
    },
  });

  return client;
}
