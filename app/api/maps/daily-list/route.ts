import { type NextRequest, NextResponse } from "next/server";
import { MISSING_PLACES_KEY_MESSAGE } from "@/lib/maps/constants";
import {
  DIGEST_PLACES_REQUEST_CAP,
  DIGEST_SKIP_STATUSES,
  collectDigestDrafts,
  digestBusinessFromStored,
  digestQueries,
  mexicoCityDateISO,
  parseDigestRequest,
  type DigestBusiness,
} from "@/lib/maps/digest";
import { MapsError, mapsDbErrorMessage } from "@/lib/maps/errors";
import { searchPlaces } from "@/lib/maps/places";
import { leadDraftToInsert } from "@/lib/maps/persist";
import type { MapsLeadDraft } from "@/lib/maps/types";
import { IngestConfigError } from "@/lib/reddit-web/errors";
import { resolveRedditWebOwnerId } from "@/lib/reddit-web/owner";
import { bearerTokenMatches } from "@/lib/reddit-web/secret";
import { createServiceClient, type SupabaseServiceClient } from "@/lib/supabase/service";
import type { MapsDigestSource, MapsLead } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ready-to-send WhatsApp list for a Telegram digest.
 *
 * GET /api/maps/daily-list?count=20&city=&giros=
 * Authorization: Bearer <MAPS_DIGEST_SECRET>
 *
 * At most {@link DIGEST_PLACES_REQUEST_CAP} Text Search calls, one page each.
 * Repeating the default call the same Mexico City day returns the stored list
 * and does not call Places again.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.MAPS_DIGEST_SECRET?.trim() ?? "";
  if (!expected) {
    console.error("[maps-digest] MAPS_DIGEST_SECRET missing");
    return NextResponse.json(
      { ok: false, error: "MAPS_DIGEST_SECRET no está configurado." },
      { status: 500 },
    );
  }

  if (!bearerTokenMatches(request.headers.get("authorization"), expected)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const parsed = parseDigestRequest(request.nextUrl.searchParams);
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
    if (!apiKey) {
      throw new MapsError("MISSING_PLACES_KEY", MISSING_PLACES_KEY_MESSAGE);
    }

    const supabase = createServiceClient();
    const userId = await resolveRedditWebOwnerId(supabase);
    const date = mexicoCityDateISO();
    const custom = Boolean(parsed.city || parsed.giros);
    const source: MapsDigestSource = custom ? "custom" : "default";

    const excluded = await loadExcludedPlaceIds(supabase, userId);
    let cached: DigestBusiness[] = [];
    if (!custom) {
      cached = await loadCachedBusinesses(supabase, userId, date);
      if (cached.length >= parsed.count) {
        console.log("[maps-digest] cache hit", { date, count: parsed.count });
        return NextResponse.json({
          ok: true,
          date,
          cached: true,
          requested: parsed.count,
          places_requests: 0,
          places_request_cap: DIGEST_PLACES_REQUEST_CAP,
          businesses: sortBusinesses(cached).slice(0, parsed.count),
        });
      }
    }

    const queries = digestQueries({
      date,
      limit: DIGEST_PLACES_REQUEST_CAP,
      ...(parsed.city ? { city: parsed.city } : {}),
      ...(parsed.giros ? { giros: parsed.giros } : {}),
    });
    const { drafts, placesRequests } = await collectDigestDrafts({
      queries,
      excludedPlaceIds: excluded,
      maxRequests: DIGEST_PLACES_REQUEST_CAP,
      targetCount: parsed.count - cached.length,
      search: (textQuery) =>
        searchPlaces(textQuery, apiKey, fetch, { maxPages: 1, timeoutMs: 12_000 }),
    });

    if (drafts.length > 0) {
      await persistDigest(supabase, userId, date, source, drafts);
    }

    const fresh = drafts.flatMap((draft) => {
      const business = digestBusinessFromStored({
        name: draft.name,
        specialty: draft.specialty,
        city: draft.city,
        rating: draft.rating,
        user_rating_count: draft.userRatingCount,
        whatsapp_e164: draft.whatsappE164,
        google_maps_uri: draft.googleMapsUri,
        phone_national: draft.phoneNational,
        phone_international: draft.phoneInternational,
        lead_reason: draft.leadReason,
        business_status: draft.businessStatus,
      });
      return business ? [business] : [];
    });

    const businesses = sortBusinesses([...cached, ...fresh]).slice(0, parsed.count);
    console.log("[maps-digest] ok", {
      date,
      source,
      requested: parsed.count,
      returned: businesses.length,
      placesRequests,
      cached: cached.length,
    });

    return NextResponse.json({
      ok: true,
      date,
      cached: false,
      requested: parsed.count,
      places_requests: placesRequests,
      places_request_cap: DIGEST_PLACES_REQUEST_CAP,
      businesses,
    });
  } catch (error) {
    return fail(error);
  }
}

async function loadExcludedPlaceIds(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; from < 20_000; from += pageSize) {
    const leads = await supabase
      .from("maps_leads")
      .select("place_id")
      .eq("user_id", userId)
      .in("status", [...DIGEST_SKIP_STATUSES])
      .range(from, from + pageSize - 1);
    if (leads.error) failDb(leads.error, "excluded leads");
    for (const row of leads.data ?? []) ids.add(row.place_id);

    const digested = await supabase
      .from("maps_digest_log")
      .select("place_id")
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);
    if (digested.error) failDb(digested.error, "digest log");
    for (const row of digested.data ?? []) ids.add(row.place_id);

    const leadCount = leads.data?.length ?? 0;
    const digestCount = digested.data?.length ?? 0;
    if (leadCount < pageSize && digestCount < pageSize) break;
  }
  return ids;
}

async function loadCachedBusinesses(
  supabase: SupabaseServiceClient,
  userId: string,
  date: string,
): Promise<DigestBusiness[]> {
  const logged = await supabase
    .from("maps_digest_log")
    .select("place_id")
    .eq("user_id", userId)
    .eq("digest_date", date)
    .eq("source", "default");
  if (logged.error) failDb(logged.error, "today cache");
  const placeIds = (logged.data ?? []).map((row) => row.place_id);
  if (placeIds.length === 0) return [];

  const leads: MapsLead[] = [];
  for (let index = 0; index < placeIds.length; index += 100) {
    const slice = placeIds.slice(index, index + 100);
    const result = await supabase
      .from("maps_leads")
      .select("*")
      .eq("user_id", userId)
      .in("place_id", slice);
    if (result.error) failDb(result.error, "cached leads");
    leads.push(...(result.data ?? []));
  }

  return leads.flatMap((lead) => {
    const business = digestBusinessFromStored(lead);
    return business ? [business] : [];
  });
}

async function persistDigest(
  supabase: SupabaseServiceClient,
  userId: string,
  date: string,
  source: MapsDigestSource,
  drafts: MapsLeadDraft[],
): Promise<void> {
  const seenAt = new Date().toISOString();
  const rows = drafts.map((draft) =>
    leadDraftToInsert(userId, draft, seenAt, "enviado_a_lista"),
  );
  const saved = await supabase
    .from("maps_leads")
    .upsert(rows, { onConflict: "user_id,place_id" });
  if (saved.error) failDb(saved.error, "upsert leads");

  const logged = await supabase.from("maps_digest_log").upsert(
    drafts.map((draft) => ({
      user_id: userId,
      place_id: draft.placeId,
      digest_date: date,
      source,
    })),
    { onConflict: "user_id,place_id", ignoreDuplicates: true },
  );
  if (logged.error) failDb(logged.error, "digest log");
}

function sortBusinesses(items: DigestBusiness[]): DigestBusiness[] {
  return [...items].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"),
  );
}

function failDb(error: { code?: string; message?: string }, context: string): never {
  console.error("[maps-digest] db", {
    context,
    code: error.code,
    message: error.message,
  });
  throw new MapsError("DB", digestFailureMessage(error));
}

function digestFailureMessage(error: { code?: string; message?: string }): string {
  if (error.code === "23514" || /maps_digest_log/i.test(error.message ?? "")) {
    return "Falta aplicar supabase/migrations/20261007_maps_digest.sql en el SQL Editor de Supabase.";
  }
  return mapsDbErrorMessage(error);
}

function fail(error: unknown): NextResponse {
  if (error instanceof MapsError) {
    const status = error.code === "BAD_QUERY" ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  if (error instanceof IngestConfigError) {
    console.error("[maps-digest] owner", { message: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("[maps-digest] failed", { message });
  const missingService = message.includes("SUPABASE_SERVICE_ROLE_KEY");
  return NextResponse.json(
    {
      ok: false,
      error: missingService
        ? "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en el servidor."
        : "No se pudo armar la lista diaria.",
    },
    { status: 500 },
  );
}
