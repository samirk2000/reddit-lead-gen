import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Ensures an authenticated user session exists for a Server Component.
 *
 * The route-group middleware already guards protected routes; this acts as a
 * defense-in-depth check inside Server Components (e.g. during static
 * generation or direct data fetches). Redirects to /login when no user is
 * found.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient(cookies());

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}
