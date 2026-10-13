import { type NextRequest, NextResponse } from "next/server";
import { parseDesktopLead } from "@/lib/leads/desktop-lead";
import { processDesktopLead } from "@/lib/leads/process-desktop-lead";
import { IngestConfigError } from "@/lib/reddit-web/errors";
import { resolveRedditWebOwnerId } from "@/lib/reddit-web/owner";
import { bearerTokenMatches } from "@/lib/reddit-web/secret";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 1_000_000;

/**
 * Ingest for the Windows scanner (BuscadorSubredditsZombies).
 *
 * POST /api/leads/ingest
 * Authorization: Bearer <REDDIT_INGEST_SECRET>
 *
 * One raw lead per request. Gemini scores it, the row lands in detected_leads,
 * and Telegram fires only when the score reaches TELEGRAM_ALERT_MIN_SCORE.
 * Nothing here posts to Reddit.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.REDDIT_INGEST_SECRET?.trim() ?? "";
  if (!expected) {
    console.error("[leads/ingest] REDDIT_INGEST_SECRET missing");
    return NextResponse.json(
      { ok: false, error: "REDDIT_INGEST_SECRET no está configurado." },
      { status: 500 },
    );
  }

  if (!bearerTokenMatches(request.headers.get("authorization"), expected)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "El cuerpo supera 1 MB." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("[leads/ingest] invalid json", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "El cuerpo no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = parseDesktopLead(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, issues: parsed.issues },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    const userId = await resolveRedditWebOwnerId(supabase);
    const result = await processDesktopLead(supabase, userId, parsed.lead);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    console.log("[leads/ingest] ok", {
      duplicate: result.duplicate,
      score: result.intent_score,
      alerted: result.alerted,
      status: result.status,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof IngestConfigError) {
      console.error("[leads/ingest] config", { message: error.message });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[leads/ingest] failed", { message });
    const missingService = message.includes("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      {
        ok: false,
        error: missingService
          ? "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en el servidor."
          : "No se pudo procesar el lead.",
      },
      { status: 500 },
    );
  }
}
