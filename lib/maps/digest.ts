import { MEXICO_CITY_PRESETS, canonicalCityQuery } from "@/lib/maps/cities";
import { MapsError } from "@/lib/maps/errors";
import { buildOpeningMessage, whatsAppHref } from "@/lib/maps/message";
import { buildLeadDrafts } from "@/lib/maps/qualify";
import { scoreMapsLead } from "@/lib/maps/score";
import type { MapsLeadDraft, RawPlace } from "@/lib/maps/types";
import type { MapsLeadReason, MapsLeadStatus } from "@/lib/supabase/types";

/**
 * Text Search calls per daily-list invocation. Each call is one page
 * (up to 20 places), so this is also the Places Enterprise event cap.
 * 8 stays under the requested ceiling of 10 and, once a day, is 8 of the
 * 1,000 free Text Search Enterprise events.
 */
export const DIGEST_PLACES_REQUEST_CAP = 8;

export const DIGEST_DEFAULT_COUNT = 20;
export const DIGEST_MAX_COUNT = 40;

/** Statuses that mean the business was already worked or already listed. */
export const DIGEST_SKIP_STATUSES = [
  "contactado",
  "respondió",
  "cerrado",
  "descartado",
  "enviado_a_lista",
] as const satisfies readonly MapsLeadStatus[];

export type DigestRequest = {
  count: number;
  city?: string;
  giros?: string[];
};

/** Query string of GET /api/maps/daily-list. */
export function parseDigestRequest(params: URLSearchParams): DigestRequest {
  const request: DigestRequest = { count: parseCount(params.get("count")) };
  const city = params.get("city")?.trim().replace(/\s+/g, " ") ?? "";
  if (city) {
    if (city.length < 2 || city.length > 80) {
      throw new MapsError(
        "BAD_QUERY",
        "La ciudad debe tener entre 2 y 80 caracteres.",
      );
    }
    request.city = canonicalCityQuery(city);
  }
  const girosRaw = params.get("giros");
  if (girosRaw?.trim()) {
    const giros = girosRaw
      .split(",")
      .map((giro) => giro.trim().replace(/\s+/g, " "))
      .filter((giro) => giro.length > 0);
    if (giros.length > 12) {
      throw new MapsError("BAD_QUERY", "Puedes pedir hasta 12 giros.");
    }
    for (const giro of giros) {
      if (giro.length < 2 || giro.length > 80) {
        throw new MapsError(
          "BAD_QUERY",
          "Cada giro debe tener entre 2 y 80 caracteres.",
        );
      }
    }
    request.giros = giros;
  }
  return request;
}

/** High-ticket giros, in the order the daily rotation prefers. */
export const DIGEST_GIROS = [
  "dentista",
  "implantes dentales",
  "ortodoncista",
  "abogado",
  "carpintero",
  "cocinas integrales",
  "constructora",
  "arquitecto",
  "clínica estética",
  "salón de eventos",
  "cirujano plástico",
] as const;

export type DigestQuery = {
  specialty: string;
  city: string;
};

export type DigestBusiness = {
  name: string;
  giro: string;
  city: string;
  rating: number | null;
  reviews: number | null;
  phone: string;
  maps_url: string;
  score: number;
  apertura: string;
  wa_link: string;
};

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day in Mexico City, `YYYY-MM-DD`. */
export function mexicoCityDateISO(now: Date = new Date()): string {
  return WEEKDAY_FORMAT.format(now);
}

/**
 * Pairs to search, already rotated for `date` and cut to `limit`.
 * With no city and no giros, each Mexico City day advances eight pairs
 * (the Places cap) through high-ticket giros and the big-city list.
 */
export function digestQueries(options: {
  date: string;
  city?: string;
  giros?: readonly string[];
  limit: number;
}): DigestQuery[] {
  const giros = (
    options.giros && options.giros.length > 0 ? options.giros : DIGEST_GIROS
  ).map((giro) => giro.trim().replace(/\s+/g, " ")).filter((giro) => giro.length > 0);
  const cities = options.city
    ? [canonicalCityQuery(options.city)]
    : MEXICO_CITY_PRESETS.map((preset) => preset.query);
  const pairs = interleave(giros, cities);
  if (pairs.length === 0 || options.limit <= 0) return [];
  // Step a full request-cap window each calendar day so tomorrow does not
  // repeat today's Places queries.
  const offset = positiveMod(
    dayNumber(options.date) * DIGEST_PLACES_REQUEST_CAP,
    pairs.length,
  );
  const rotated = [...pairs.slice(offset), ...pairs.slice(0, offset)];
  return rotated.slice(0, options.limit);
}

export function acceptDigestDraft(
  draft: MapsLeadDraft,
  excludedPlaceIds: ReadonlySet<string>,
): boolean {
  if (excludedPlaceIds.has(draft.placeId)) return false;
  if (!draft.whatsappE164) return false;
  if (draft.businessStatus === "CLOSED_TEMPORARILY") return false;
  if (draft.businessStatus === "CLOSED_PERMANENTLY") return false;
  return true;
}

export async function collectDigestDrafts(input: {
  queries: readonly DigestQuery[];
  excludedPlaceIds: ReadonlySet<string>;
  maxRequests: number;
  targetCount: number;
  search: (textQuery: string) => Promise<{ places: RawPlace[]; pages: number }>;
}): Promise<{ drafts: MapsLeadDraft[]; placesRequests: number }> {
  const chosen: MapsLeadDraft[] = [];
  const seen = new Set(input.excludedPlaceIds);
  let placesRequests = 0;

  for (const query of input.queries) {
    if (chosen.length >= input.targetCount) break;
    if (placesRequests >= input.maxRequests) break;
    const result = await input.search(`${query.specialty} en ${query.city}`);
    const pages = Math.max(0, result.pages);
    placesRequests += pages;
    const { drafts } = buildLeadDrafts(result.places, query.specialty, query.city);
    for (const draft of drafts) {
      if (!acceptDigestDraft(draft, seen)) continue;
      seen.add(draft.placeId);
      chosen.push(draft);
    }
  }

  chosen.sort(compareDrafts);
  return {
    drafts: chosen.slice(0, input.targetCount),
    placesRequests,
  };
}

export function digestBusinessFromDraft(draft: MapsLeadDraft): DigestBusiness | null {
  if (!draft.whatsappE164) return null;
  const apertura = buildOpeningMessage({
    name: draft.name,
    specialty: draft.specialty,
    city: draft.city,
    rating: draft.rating,
    userRatingCount: draft.userRatingCount,
  });
  return {
    name: draft.name,
    giro: draft.specialty,
    city: draft.city,
    rating: draft.rating,
    reviews: draft.userRatingCount,
    phone: draft.whatsappE164,
    maps_url: mapsUrl(draft),
    score: draft.priorityScore,
    apertura,
    wa_link: whatsAppHref(draft.whatsappE164, apertura),
  };
}

export function digestBusinessFromStored(lead: {
  name: string;
  specialty: string;
  city: string;
  rating: number | null;
  user_rating_count: number | null;
  whatsapp_e164: string | null;
  google_maps_uri: string | null;
  phone_national: string | null;
  phone_international: string | null;
  lead_reason: MapsLeadReason;
  business_status: string | null;
}): DigestBusiness | null {
  if (!lead.whatsapp_e164) return null;
  const scored = scoreMapsLead({
    specialty: lead.specialty,
    lead_reason: lead.lead_reason,
    rating: lead.rating,
    user_rating_count: lead.user_rating_count,
    phone_national: lead.phone_national,
    phone_international: lead.phone_international,
    whatsapp_e164: lead.whatsapp_e164,
    business_status: lead.business_status,
  });
  const apertura = buildOpeningMessage({
    name: lead.name,
    specialty: lead.specialty,
    city: lead.city,
    rating: lead.rating,
    userRatingCount: lead.user_rating_count,
  });
  const mapsUrl =
    lead.google_maps_uri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.name} ${lead.city}`.trim())}`;
  return {
    name: lead.name,
    giro: lead.specialty,
    city: lead.city,
    rating: lead.rating,
    reviews: lead.user_rating_count,
    phone: lead.whatsapp_e164,
    maps_url: mapsUrl,
    score: scored.score,
    apertura,
    wa_link: whatsAppHref(lead.whatsapp_e164, apertura),
  };
}

function mapsUrl(draft: MapsLeadDraft): string {
  if (draft.googleMapsUri) return draft.googleMapsUri;
  const query = encodeURIComponent(`${draft.name} ${draft.city}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function compareDrafts(a: MapsLeadDraft, b: MapsLeadDraft): number {
  return (
    b.priorityScore - a.priorityScore ||
    (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0) ||
    a.name.localeCompare(b.name, "es")
  );
}

/** One giro per city before repeating a giro, so a day is not stuck in one city. */
function interleave(giros: readonly string[], cities: readonly string[]): DigestQuery[] {
  const pairs: DigestQuery[] = [];
  const limit = giros.length * cities.length;
  let index = 0;
  while (pairs.length < limit) {
    let progressed = false;
    for (const city of cities) {
      const specialty = giros[index];
      if (!specialty) continue;
      pairs.push({ specialty, city });
      progressed = true;
    }
    if (!progressed) break;
    index += 1;
  }
  return pairs;
}

function dayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function positiveMod(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}

function parseCount(raw: string | null): number {
  if (raw == null || raw.trim() === "") return DIGEST_DEFAULT_COUNT;
  if (!/^\d+$/.test(raw.trim())) {
    throw new MapsError("BAD_QUERY", "count debe ser un entero.");
  }
  const count = Number(raw.trim());
  if (count < 1 || count > DIGEST_MAX_COUNT) {
    throw new MapsError(
      "BAD_QUERY",
      `count debe estar entre 1 y ${DIGEST_MAX_COUNT}.`,
    );
  }
  return count;
}
