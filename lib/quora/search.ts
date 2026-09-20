/**
 * Quora lead discovery via SerpAPI Google (`site:quora.com`).
 *
 * Requires `SERPAPI_KEY` in the server env (Vercel). Results are filtered to
 * IPTV / Fire Stick / player niche so random Quora junk never becomes a lead.
 */

export type QuoraHit = {
  /** Stable id used as `detected_leads.reddit_post_id` (prefixed). */
  id: string;
  title: string;
  snippet: string;
  url: string;
};

export type QuoraSearchResult = {
  hits: QuoraHit[];
  /** Human-readable failure (API key, HTTP, SerpAPI error body). */
  error: string | null;
  query: string;
  /** True when SERPAPI_KEY is present (never logs the raw key). */
  keyConfigured: boolean;
};

/** Must appear in title or snippet or we drop the hit as off-niche. */
const NICHE_RE =
  /\b(iptv|m3u|xtream|tivimate|smarters|fire\s*stick|firestick|android\s*tv|cord\s*cut|streaming|proveedor|lista\s*iptv|kodi)\b/i;

/**
 * Searches Quora questions for the given phrases via Google.
 */
export async function searchQuoraQuestions(
  phrases: string[],
): Promise<QuoraSearchResult> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    return {
      hits: [],
      error:
        "Falta SERPAPI_KEY en el servidor (Vercel → Environment Variables). La key de .env.local no se usa en producción.",
      query: "",
      keyConfigured: false,
    };
  }

  // Prefer phrases that already look niche; drop ultra-generic ones that
  // pollute Google ("prueba gratis", "cuál", etc.).
  const clean = phrases
    .map((p) => p.trim())
    .filter((p) => p.length >= 3)
    .filter((p) => NICHE_RE.test(p) || /\biptv\b/i.test(p))
    .slice(0, 3);

  const fallbackPhrases = [
    "busco iptv",
    "mejor iptv",
    "iptv fire stick",
    "proveedor iptv",
  ];
  const effective = clean.length > 0 ? clean : fallbackPhrases;

  const quoted = effective
    .map((p) => `"${p.replace(/"/g, "")}"`)
    .join(" OR ");
  // Tight query: every result must be on Quora AND niche-related.
  const q = `site:quora.com iptv (${quoted})`;

  try {
    const params = new URLSearchParams({
      engine: "google",
      q,
      hl: "es",
      gl: "mx",
      num: "10",
      api_key: apiKey,
    });

    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      cache: "no-store",
    });

    const rawText = await res.text();
    let data: {
      error?: string;
      organic_results?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
    } = {};
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      return {
        hits: [],
        error: `SerpAPI devolvió cuerpo no-JSON (HTTP ${res.status}).`,
        query: q,
        keyConfigured: true,
      };
    }

    if (!res.ok) {
      return {
        hits: [],
        error:
          data.error ||
          `SerpAPI HTTP ${res.status}. Revisá que la API key nueva esté en Vercel y redeploy.`,
        query: q,
        keyConfigured: true,
      };
    }

    if (data.error) {
      return {
        hits: [],
        error: `SerpAPI: ${data.error}`,
        query: q,
        keyConfigured: true,
      };
    }

    const hits: QuoraHit[] = [];
    const seen = new Set<string>();
    let droppedOffNiche = 0;

    for (const row of data.organic_results ?? []) {
      const url = row.link?.trim() ?? "";
      if (!url.includes("quora.com") || seen.has(url)) continue;
      seen.add(url);

      const title = (row.title ?? "").trim();
      if (!title) continue;

      const snippet = (row.snippet ?? "").trim();
      const haystack = `${title}\n${snippet}`;
      if (!NICHE_RE.test(haystack)) {
        droppedOffNiche++;
        continue;
      }

      hits.push({
        id: `quora_${hashUrl(url)}`,
        title: title.replace(/\s*[-|].*Quora.*$/i, "").trim() || title,
        snippet,
        url,
      });
    }

    return {
      hits,
      error:
        hits.length === 0
          ? droppedOffNiche > 0
            ? `SerpAPI trajo ${droppedOffNiche} resultados de Quora fuera de nicho (filtrados). Probá keywords con “iptv”.`
            : "SerpAPI OK pero sin resultados Quora de IPTV. Probá keywords más genéricas del nicho (busco iptv, iptv méxico)."
          : null,
      query: q,
      keyConfigured: true,
    };
  } catch (error) {
    console.error("[quora] searchQuoraQuestions falló:", error);
    return {
      hits: [],
      error: error instanceof Error ? error.message : String(error),
      query: q,
      keyConfigured: true,
    };
  }
}

/** Short stable hash so Quora URLs fit in `reddit_post_id`. */
function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
