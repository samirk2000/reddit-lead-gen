import { type NextRequest, NextResponse } from "next/server";
import { runLeadGenerationPipelineForAllActiveUsers } from "@/lib/pipeline/process-leads";

/** Allow the full multi-subreddit scan to finish on Vercel Pro (Hobby caps lower). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Background trigger for the lead pipeline.
 *
 * Protected by `CRON_SECRET`. Accepts either:
 *   - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron default)
 *   - `?token=<CRON_SECRET>` (manual / external schedulers)
 *
 * Intended schedule: every 2 hours via `vercel.json` (or daily on Hobby).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no está configurado." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request, expected)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
  }

  try {
    const results = await runLeadGenerationPipelineForAllActiveUsers();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "[cron] runLeadGenerationPipelineForAllActiveUsers falló:",
      error,
    );
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/** True when the request carries a valid Bearer token or query token. */
function isAuthorized(request: NextRequest, expected: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === expected) {
    return true;
  }
  const queryToken = request.nextUrl.searchParams.get("token");
  return Boolean(queryToken && queryToken === expected);
}
