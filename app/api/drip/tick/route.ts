import { type NextRequest, NextResponse } from "next/server";
import { bearerTokenMatches } from "@/lib/reddit-web/secret";
import { tick } from "@/lib/drip/engine";
import { createLiveDripDeps } from "@/lib/drip/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Drip tick, every ~5 min (GitHub Actions schedule or cron-job.org).
 * Authorization: Bearer <CRON_SECRET>  (or ?token=<CRON_SECRET> for simple pingers).
 * Sends the next business only when nothing is pending, ≥4 min since the last action,
 * Mon–Sat 11:00–20:00 CDMX, quota not met and not paused. Sends the 20:00 recap.
 */
async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET no está configurado." }, { status: 500 });
  const token = request.nextUrl.searchParams.get("token");
  const ok = bearerTokenMatches(request.headers.get("authorization"), expected) ||
    (token !== null && bearerTokenMatches(`Bearer ${token}`, expected));
  if (!ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  try {
    const result = await tick(await createLiveDripDeps(request.nextUrl.origin));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[drip] tick", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "tick falló" }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
