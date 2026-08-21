import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth email-verification callback.
 *
 * Exchanges the `code` returned by Supabase email confirmation links for a
 * session, then redirects the user into the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin),
    );
  }

  const supabase = await createClient(cookies());

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectUrl = new URL("/login", origin);
    redirectUrl.searchParams.set("error", "invalid_code");
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(
    new URL(next.startsWith("/") ? next : "/dashboard", origin),
  );
}
