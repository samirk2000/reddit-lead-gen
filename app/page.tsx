import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing + routing root.
 *
 * When an authenticated session exists the user is sent to /dashboard;
 * otherwise they are sent to the login screen.
 */
export default async function HomePage() {
  const supabase = await createClient(cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
