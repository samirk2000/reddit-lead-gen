"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error: string | null;
};

/**
 * Signs the user in with email/password. On success it redirects to the
 * provided `next` path (or /dashboard).
 */
export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const next =
    formData.get("next")?.toString()?.trim() || "/dashboard";

  const state: AuthActionState = { error: null };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim().length === 0 ||
    password.length === 0
  ) {
    state.error = "Email y contraseña son obligatorios.";
    return state;
  }

  const supabase = await createClient(cookies());

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    state.error = error.message;
    return state;
  }

  revalidatePath("/dashboard", "layout");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

/**
 * Registers a new user with email/password. On success it redirects to
 * /dashboard.
 */
export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  const state: AuthActionState = { error: null };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim().length === 0 ||
    password.length < 6
  ) {
    state.error = "La contraseña debe tener al menos 6 caracteres.";
    return state;
  }

  const supabase = await createClient(cookies());

  const origin = await siteOrigin();

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    state.error = error.message;
    return state;
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

/**
 * Resolves the public site origin (used to build the email verification link).
 * Prefers NEXT_PUBLIC_SITE_URL when set, otherwise falls back to the request
 * host header.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured;
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    return "http://localhost:3000";
  }
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
