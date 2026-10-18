import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MISSING_PLACES_KEY_MESSAGE } from "@/lib/maps/constants";
import {
  DIGEST_PLACES_REQUEST_CAP,
  DIGEST_SKIP_STATUSES,
  DIGEST_MAX_COUNT,
  collectDigestDrafts,
  digestBusinessFromStored,
  digestQueries,
  digestSearchCursor,
  storedLeadMatchesGiro,
  mexicoCityDateISO,
  parseDigestRequest,
  type DigestBusiness,
} from "@/lib/maps/digest";
import { MapsError, mapsDbErrorMessage } from "@/lib/maps/errors";
import { isNotariaBusiness } from "@/lib/maps/notaria";
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
 * GET /api/maps/daily-list?all=1  — every business saved today, no new search
 * GET /api/maps/daily-list?more=1 — the next giro/city window (drip refill)
 * Authorization: Bearer <MAPS_DIGEST_SECRET>
 *
 * At most {@link DIGEST_PLACES_REQUEST_CAP} Text Search calls, one page each.
 * Repeating the default call the same Mexico City day returns the stored list
 * and does not call Places again. Notarías are dropped even when that cache
 * was built before they left the rotation; if that leaves the list short,
 * the same call fills the rest from the current giros. `more=1` continues
 * the same rotation.
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
    const more = request.nextUrl.searchParams.get("more") === "1";
    const all = request.nextUrl.searchParams.get("all") === "1";
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
      cached = omitNotarias(await loadCachedBusinesses(supabase, userId, date));
      if (more) {
        const pulled = await pullNextWindow(supabase, {
          date,
          apiKey,
          userId,
          excluded,
          source,
          cachedCount: cached.length,
        });
        console.log("[maps-digest] refill", { date, added: pulled.businesses.length, placesRequests: pulled.placesRequests });
        return NextResponse.json({
          ok: true,
          date,
          cached: false,
          refill: true,
          requested: parsed.count,
          places_requests: pulled.placesRequests,
          places_request_cap: DIGEST_PLACES_REQUEST_CAP,
          businesses: pulled.businesses,
        });
      }
      if (all && cached.length > 0) {
        return NextResponse.json({
          ok: true,
          date,
          cached: true,
          requested: cached.length,
          places_requests: 0,
          places_request_cap: DIGEST_PLACES_REQUEST_CAP,
          businesses: sortBusinesses(cached),
        });
      }
      if (!all && cached.length >= parsed.count) {
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

    const cursor = custom ? null : await loadRefillCursor(supabase, date, cached.length > 0);
    const queries = cursor?.giveUp
      ? []
      : digestQueries({
          date,
          limit: DIGEST_PLACES_REQUEST_CAP,
          ...(cursor ? { cursor: cursor.cursor } : {}),
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
    if (cursor && !cursor.giveUp) {
      await saveRefillCursor(supabase, date, cursor.cursor + queries.length, drafts.length === 0 ? cursor.empty + 1 : 0);
    }

    const fresh = drafts.flatMap((draft) => {
      const business = digestBusinessFromStored({
        place_id: draft.placeId,
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

    const merged = sortBusinesses(omitNotarias([...cached, ...fresh]));
    const businesses = all ? merged : merged.slice(0, parsed.count);
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

const REFILL_EMPTY_LIMIT = 2;

// query_cursor lives on telegram_drip_state, which is not in the generated Database types yet.
type Loose = SupabaseClient<any>;

function dripDb(supabase: SupabaseServiceClient): Loose {
  return supabase as unknown as Loose;
}

type RefillCursor = { cursor: number; empty: number; giveUp: boolean };

async function loadRefillCursor(
  supabase: SupabaseServiceClient,
  date: string,
  cacheExists: boolean,
): Promise<RefillCursor> {
  const row = await dripDb(supabase)
    .from("telegram_drip_state")
    .select("query_cursor, cursor_empty, cursor_day")
    .eq("id", 1)
    .maybeSingle();
  if (row.error) failDb(row.error, "drip cursor");
  const storedCursor = Number(row.data?.query_cursor) || 0;
  const sameDay = row.data?.cursor_day === date;
  const empty = sameDay ? Number(row.data?.cursor_empty) || 0 : 0;
  const cursor = storedCursor > 0 ? storedCursor : digestSearchCursor(date, cacheExists ? 1 : 0);
  return { cursor, empty, giveUp: empty >= REFILL_EMPTY_LIMIT };
}

async function saveRefillCursor(
  supabase: SupabaseServiceClient,
  date: string,
  cursor: number,
  empty: number,
): Promise<void> {
  const saved = await dripDb(supabase)
    .from("telegram_drip_state")
    .update({
      query_cursor: cursor,
      cursor_empty: empty,
      cursor_day: date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (saved.error) failDb(saved.error, "drip cursor save");
}

async function pullNextWindow(
  supabase: SupabaseServiceClient,
  input: {
    date: string;
    apiKey: string;
    userId: string;
    excluded: Set<string>;
    source: MapsDigestSource;
    cachedCount: number;
  },
): Promise<{ businesses: DigestBusiness[]; placesRequests: number }> {
  const cursor = await loadRefillCursor(supabase, input.date, input.cachedCount > 0);
  if (cursor.giveUp) return { businesses: [], placesRequests: 0 };
  const queries = digestQueries({
    date: input.date,
    limit: DIGEST_PLACES_REQUEST_CAP,
    cursor: cursor.cursor,
  });
  const { drafts, placesRequests } = await collectDigestDrafts({
    queries,
    excludedPlaceIds: input.excluded,
    maxRequests: DIGEST_PLACES_REQUEST_CAP,
    targetCount: DIGEST_MAX_COUNT,
    search: (textQuery) =>
      searchPlaces(textQuery, input.apiKey, fetch, { maxPages: 1, timeoutMs: 12_000 }),
  });
  if (drafts.length > 0) {
    await persistDigest(supabase, input.userId, input.date, input.source, drafts);
  }
  await saveRefillCursor(
    supabase,
    input.date,
    cursor.cursor + queries.length,
    drafts.length === 0 ? cursor.empty + 1 : 0,
  );
  return { businesses: omitNotarias(draftsToBusinesses(drafts)), placesRequests };
}

function draftsToBusinesses(drafts: readonly MapsLeadDraft[]): DigestBusiness[] {
  return drafts.flatMap((draft) => {
    const business = digestBusinessFromStored({
      place_id: draft.placeId,
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
}

function omitNotarias(items: readonly DigestBusiness[]): DigestBusiness[] {
  return items.filter((item) => !isNotariaBusiness({ name: item.name, giro: item.giro }));
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
    if (lead.status === "descartado") return [];
    if (isNotariaBusiness({ name: lead.name, specialty: lead.specialty })) return [];
    if (!storedLeadMatchesGiro(lead)) return [];
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
  if (error.code === "42703" || /query_cursor|cursor_empty|cursor_day/i.test(error.message ?? "")) {
    return "Falta aplicar supabase/migrations/20261018_drip_refill.sql en el SQL Editor de Supabase.";
  }
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
