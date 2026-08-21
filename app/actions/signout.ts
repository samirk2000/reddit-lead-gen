"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Signs the current user out and returns them to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient(cookies());
  await supabase.auth.signOut();
  redirect("/login");
}
