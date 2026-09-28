import { type NextRequest, NextResponse } from "next/server";
import { IngestConfigError, redditWebDbErrorMessage } from "@/lib/reddit-web/errors";
import { resolveRedditWebOwnerId } from "@/lib/reddit-web/owner";
import { bearerTokenMatches } from "@/lib/reddit-web/secret";
import { parseIngestBody, toIngestRow } from "@/lib/reddit-web/validate";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Ingest for the external Reddit bot.
 *
 * POST /api/reddit-web/ingest
 * Authorization: Bearer <REDDIT_INGEST_SECRET>
 * Body: JSON array of leads (see docs/LEADS_REDDIT.md).
 *
 * Upserts on (user_id, reddit_id). estado and notas are not in the payload,
 * so an existing row keeps the operator's status and notes.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.REDDIT_INGEST_SECRET?.trim() ?? "";
  if (!expected) {
    console.error("[reddit-web] REDDIT_INGEST_SECRET missing");
    return NextResponse.json(
      { ok: false, error: "REDDIT_INGEST_SECRET no está configurado." },
      { status: 500 },
    );
  }

  if (!bearerTokenMatches(request.headers.get("authorization"), expected)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
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
    console.error("[reddit-web] invalid json", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "El cuerpo no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = parseIngestBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, issues: parsed.issues },
      { status: 400 },
    );
  }

  if (parsed.leads.length === 0) {
    return NextResponse.json({
      ok: true,
      upserted: 0,
      received: parsed.received,
      deduped: parsed.deduped,
    });
  }

  try {
    const supabase = createServiceClient();
    const userId = await resolveRedditWebOwnerId(supabase);
    const rows = parsed.leads.map((lead) => toIngestRow(userId, lead));
    const { error } = await supabase.from("reddit_web_leads").upsert(rows, {
      onConflict: "user_id,reddit_id",
      defaultToNull: false,
    });

    if (error) {
      console.error("[reddit-web] upsert failed", {
        code: error.code,
        message: error.message,
        count: rows.length,
      });
      return NextResponse.json(
        { ok: false, error: redditWebDbErrorMessage(error) },
        { status: 500 },
      );
    }

    console.log("[reddit-web] ingest ok", {
      upserted: rows.length,
      received: parsed.received,
      deduped: parsed.deduped,
    });

    return NextResponse.json({
      ok: true,
      upserted: rows.length,
      received: parsed.received,
      deduped: parsed.deduped,
    });
  } catch (error) {
    if (error instanceof IngestConfigError) {
      console.error("[reddit-web] config", { message: error.message });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reddit-web] ingest failed", { message });
    const missingService = message.includes("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      {
        ok: false,
        error: missingService
          ? "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en el servidor."
          : "No se pudo guardar el lote.",
      },
      { status: 500 },
    );
  }
}
