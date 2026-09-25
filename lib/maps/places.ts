import { MAX_PLACE_PAGES } from "@/lib/maps/constants";
import { MapsError } from "@/lib/maps/errors";
import type { RawPlace } from "@/lib/maps/types";

/**
 * Lean Text Search field mask. Phone, website and rating bill as
 * Text Search Enterprise. Reviews, photos and hours are omitted so the
 * request does not jump to Enterprise + Atmosphere.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

type SearchPayload = {
  places?: RawPlace[];
  nextPageToken?: string;
  error?: { message?: string };
};

function placesError(status: number, body: string, apiKey: string): MapsError {
  let detail = `Google Places respondió ${status}.`;
  try {
    const payload = JSON.parse(body) as SearchPayload;
    const message = payload.error?.message?.trim();
    if (message) {
      detail = message.replaceAll(apiKey, "[clave]").slice(0, 300);
    }
  } catch {
    // Body was not JSON.
  }
  return new MapsError(
    "PLACES",
    `No se pudo consultar Google Places. ${detail}`,
  );
}

export async function searchPlaces(
  textQuery: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ places: RawPlace[]; pages: number }> {
  const places: RawPlace[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  for (let page = 0; page < MAX_PLACE_PAGES; page += 1) {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: "es",
      regionCode: "MX",
      pageSize: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    let response: Response;
    try {
      response = await fetchImpl(PLACES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.error("[maps] places network error", {
        query: textQuery,
        page: page + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new MapsError(
        "PLACES_NETWORK",
        "No hubo respuesta de Google Places. Revisa la red del servidor e intenta de nuevo.",
      );
    }

    const raw = await response.text();
    if (!response.ok) {
      console.error("[maps] places http error", {
        query: textQuery,
        page: page + 1,
        status: response.status,
      });
      throw placesError(response.status, raw, apiKey);
    }

    let payload: SearchPayload;
    try {
      payload = JSON.parse(raw) as SearchPayload;
    } catch {
      throw new MapsError(
        "PLACES",
        "Google Places devolvió una respuesta ilegible.",
      );
    }

    pages += 1;
    if (Array.isArray(payload.places)) places.push(...payload.places);
    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  return { places, pages };
}
