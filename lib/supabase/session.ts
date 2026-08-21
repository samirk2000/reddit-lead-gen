import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated user id for a Server Action, or throws when no
 * session exists. Actions use this to guard every mutation.
 *
 * @throws Error when the caller is not authenticated.
 */
export async function requireUserId(): Promise<string> {
  const supabase = await createClient(cookies());

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("No autorizado.");
  }

  return user.id;
}
