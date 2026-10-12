import { type NextRequest, NextResponse } from "next/server";
import { MapsError, mapsDbErrorMessage } from "@/lib/maps/errors";
import {
  chooseMarkTarget,
  markStatusDecision,
  parseMarkStatusBody,
  type MarkableLead,
} from "@/lib/maps/mark-status";
import { IngestConfigError } from "@/lib/reddit-web/errors";
import { resolveRedditWebOwnerId } from "@/lib/reddit-web/owner";
import { bearerTokenMatches } from "@/lib/reddit-web/secret";
import { createServiceClient, type SupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const LEAD_COLUMNS =
  "id, place_id, status, whatsapp_e164, phone_national, phone_international, updated_at";

/**
 * POST /api/maps/mark-status
 * Authorization: Bearer <MAPS_DIGEST_SECRET>
 *
 * Body: { place_id?: string, phone?: string, status: "contactado"|"respondio"|"descartado" }
 * place_id wins. Otherwise the last 10 digits of phone are matched.
 * A lead already `cerrado` is left as-is (`unchanged: true`).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.MAPS_DIGEST_SECRET?.trim() ?? "";
  if (!expected) {
    console.error("[maps-mark] MAPS_DIGEST_SECRET missing");
    return NextResponse.json(
      { ok: false, error: "MAPS_DIGEST_SECRET no está configurado." },
      { status: 500 },
    );
  }
  if (!bearerTokenMatches(request.headers.get("authorization"), expected)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "El cuerpo debe ser un objeto JSON." },
      { status: 400 },
    );
  }

  try {
    const parsed = parseMarkStatusBody(body);
    const supabase = createServiceClient();
    const userId = await resolveRedditWebOwnerId(supabase);
    const lead = await findLead(supabase, userId, parsed.placeId, parsed.phoneLast10);
    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "No encontré ese prospecto." },
        { status: 404 },
      );
    }

    const decision = markStatusDecision(lead.status, parsed.status);
    if (!decision.unchanged) {
      const { error } = await supabase
        .from("maps_leads")
        .update({
          status: decision.status,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("id", lead.id);
      if (error) failDb(error, "update status");
    }

    console.log("[maps-mark] ok", {
      placeId: lead.place_id,
      status: decision.status,
      unchanged: decision.unchanged,
    });
    return NextResponse.json({
      ok: true,
      unchanged: decision.unchanged,
      place_id: lead.place_id,
      status: decision.status,
    });
  } catch (error) {
    return fail(error);
  }
}

async function findLead(
  supabase: SupabaseServiceClient,
  userId: string,
  placeId: string | null,
  phoneLast10: string | null,
): Promise<MarkableLead | null> {
  let byPlace: MarkableLead | null = null;
  if (placeId) {
    const found = await supabase
      .from("maps_leads")
      .select(LEAD_COLUMNS)
      .eq("user_id", userId)
      .eq("place_id", placeId)
      .maybeSingle();
    if (found.error) failDb(found.error, "place lookup");
    byPlace = found.data;
  }
  if (byPlace || !phoneLast10) return byPlace;

  const candidates: MarkableLead[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 20_000; from += pageSize) {
    const page = await supabase
      .from("maps_leads")
      .select(LEAD_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (page.error) failDb(page.error, "phone lookup");
    candidates.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) break;
  }
  return chooseMarkTarget(null, candidates, phoneLast10);
}

function failDb(error: { code?: string; message?: string }, context: string): never {
  console.error("[maps-mark] db", {
    context,
    code: error.code,
    message: error.message,
  });
  throw new MapsError("DB", mapsDbErrorMessage(error));
}

function fail(error: unknown): NextResponse {
  if (error instanceof MapsError) {
    const status = error.code === "BAD_QUERY" ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  if (error instanceof IngestConfigError) {
    console.error("[maps-mark] owner", { message: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("[maps-mark] failed", { message });
  const missingService = message.includes("SUPABASE_SERVICE_ROLE_KEY");
  return NextResponse.json(
    {
      ok: false,
      error: missingService
        ? "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en el servidor."
        : "No se pudo actualizar el prospecto.",
    },
    { status: 500 },
  );
}
