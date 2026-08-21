import { type NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  type SetAllCookies,
  type GetAllCookies,
} from "@supabase/ssr";
import { type Database } from "@/lib/supabase/types";

/** Route prefixes that require an authenticated session. */
const PROTECTED_ROUTES = ["/dashboard"];

/**
 * Session-refreshing edge middleware.
 *
 * Runs before every request, refreshes the Supabase auth cookie when needed,
 * and redirects unauthenticated users away from protected routes.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Without credentials the session cannot be resolved; serve the request.
    return response;
  }

  const getAllCookies: GetAllCookies = () => request.cookies.getAll();

  const setAllCookies: SetAllCookies = (cookiesToSet) => {
    cookiesToSet.forEach(({ name, value }) =>
      request.cookies.set(name, value),
    );
    response = NextResponse.next({ request });
    cookiesToSet.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
  };

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: getAllCookies,
      setAll: setAllCookies,
    },
  });

  // Force a session refresh (and cookie rotation) before reading the user.
  await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );

  if (isProtected) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - `_next/static`, `_next/image`
     * - favicon.ico and any path containing a file extension
     * - `/api` (handled by its own route handlers)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};
