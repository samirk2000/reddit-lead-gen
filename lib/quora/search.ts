/**
 * Quora lead discovery via SerpAPI Google (`site:quora.com`).
 *
 * Quora has no stable public API and blocks scrapers aggressively, so we
 * discover questions through Google (which SerpAPI already powers) and store
 * the Quora URLs as leads. Requires `SERPAPI_KEY`.
 *
 * Cost: ~1 SerpAPI search per phrase batch (we OR a few phrases in one query
 * when possible; otherwise 1 search per phrase, capped by the caller).
 */

export type QuoraHit = {
  /** Stable id used as `detected_leads.reddit_post_id` (prefixed). */
  id: string;
  title: string;
  snippet: string;
  url: string;
};

/**
 * Searches Quora questions for the given Spanish/LATAM phrases.
 * Returns [] when `SERPAPI_KEY` is missing or every request fails.
 */
export async function searchQuoraQuestions(
  phrases: string[],
): Promise<QuoraHit[]> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) return [];

  const clean = phrases.map((p) => p.trim()).filter((p) => p.length >= 3);
  if (clean.length === 0) return [];

  // One Google query: site:quora.com ("frase1" OR "frase2" OR …) — saves credits.
  const orClause = clean
    .slice(0, 3)
    .map((p) => `"${p.replace(/"/g, "")}"`)
    .join(" OR ");
  const q = `site:quora.com (${orClause})`;

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
    if (!res.ok) {
      console.warn(`[quora] SerpAPI Google HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      organic_results?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
    };

    const hits: QuoraHit[] = [];
    const seen = new Set<string>();

    for (const row of data.organic_results ?? []) {
      const url = row.link?.trim() ?? "";
      if (!url.includes("quora.com") || seen.has(url)) continue;
      seen.add(url);

      const title = (row.title ?? "").trim();
      if (!title) continue;

      hits.push({
        id: `quora_${hashUrl(url)}`,
        title: title.replace(/\s*[-|].*Quora.*$/i, "").trim() || title,
        snippet: (row.snippet ?? "").trim(),
        url,
      });
    }

    return hits;
  } catch (error) {
    console.error("[quora] searchQuoraQuestions falló:", error);
    return [];
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
