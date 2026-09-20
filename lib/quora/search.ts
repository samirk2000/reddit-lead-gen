/**
 * Quora lead discovery via SerpAPI Google (`site:quora.com`).
 *
 * Filtering is driven by the user's active keywords (same idea as Reddit):
 * Google is queried with those phrases, then organic hits must match at least
 * one keyword before becoming a lead.
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
  error: string | null;
  query: string;
  keyConfigured: boolean;
};

/**
 * Searches Quora using the caller's keyword phrases.
 */
export async function searchQuoraQuestions(
  phrases: string[],
): Promise<QuoraSearchResult> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    return {
      hits: [],
      error:
        "Falta SERPAPI_KEY en el servidor (Vercel → Environment Variables).",
      query: "",
      keyConfigured: false,
    };
  }

  const clean = [
    ...new Set(
      phrases.map((p) => p.trim()).filter((p) => p.length >= 3),
    ),
  ].slice(0, 5);

  if (clean.length === 0) {
    return {
      hits: [],
      error: "No hay keywords activas para buscar en Quora.",
      query: "",
      keyConfigured: true,
    };
  }

  // Query built FROM keywords — not a hardcoded niche dump.
  const quoted = clean
    .map((p) => `"${p.replace(/"/g, "")}"`)
    .join(" OR ");
  const q = `site:quora.com (${quoted})`;

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

    if (!res.ok || data.error) {
      return {
        hits: [],
        error:
          data.error ||
          `SerpAPI HTTP ${res.status}. Revisá la key en Vercel y redeploy.`,
        query: q,
        keyConfigured: true,
      };
    }

    const hits: QuoraHit[] = [];
    const seen = new Set<string>();
    let droppedNoKeyword = 0;

    for (const row of data.organic_results ?? []) {
      const url = row.link?.trim() ?? "";
      if (!url.includes("quora.com") || seen.has(url)) continue;
      seen.add(url);

      const title = (row.title ?? "").trim();
      if (!title) continue;
      const snippet = (row.snippet ?? "").trim();

      // Keyword gate (same role as Reddit match): must hit at least one phrase.
      if (!matchesAnyKeyword(`${title}\n${snippet}`, clean)) {
        droppedNoKeyword++;
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
          ? droppedNoKeyword > 0
            ? `Google trajo ${droppedNoKeyword} resultados Quora sin match de tus keywords (filtrados). Ajustá keywords en el panel.`
            : "Sin resultados Quora para tus keywords. Probá frases más cortas (ej. busco iptv)."
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

/** Accent-insensitive substring match against any user keyword. */
function matchesAnyKeyword(haystackRaw: string, phrases: string[]): boolean {
  const haystack = normalize(haystackRaw);
  return phrases.some((phrase) => {
    const needle = normalize(phrase);
    if (!needle) return false;
    if (needle.split(/\s+/).length >= 2) return haystack.includes(needle);
    // Single token: require word-ish boundary to avoid tiny false positives.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}_])${escaped}(?:[^\\p{L}\\p{N}_]|$)`,
      "iu",
    ).test(haystack);
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
