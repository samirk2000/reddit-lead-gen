/**
 * Quora lead discovery via SerpAPI Google (`site:quora.com`).
 *
 * Driven by the user's active keywords: we query Google with those phrases,
 * then keep hits that share meaningful tokens with the keywords (not random
 * Quora junk, not ultra-strict full-phrase-only matching).
 */

export type QuoraHit = {
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

const STOPWORDS = new Set([
  "busco",
  "necesito",
  "mejor",
  "para",
  "como",
  "cual",
  "cuál",
  "que",
  "qué",
  "una",
  "unos",
  "unas",
  "the",
  "and",
  "for",
  "con",
  "por",
  "del",
  "los",
  "las",
]);

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
        "Falta SERPAPI_KEY en Vercel (Settings → Environment Variables) + Redeploy.",
      query: "",
      keyConfigured: false,
    };
  }

  const clean = [
    ...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 3)),
  ].slice(0, 5);

  if (clean.length === 0) {
    return {
      hits: [],
      error: "No hay keywords activas. Andá a Keywords y activá/sembrá frases.",
      query: "",
      keyConfigured: true,
    };
  }

  const tokens = extractTokens(clean);
  // Two-pass query: exact phrases, then looser token OR (iptv OR firestick…).
  const quoted = clean
    .slice(0, 3)
    .map((p) => `"${p.replace(/"/g, "")}"`)
    .join(" OR ");
  const tokenOr =
    tokens.length > 0
      ? tokens
          .slice(0, 6)
          .map((t) => t)
          .join(" OR ")
      : "iptv";
  const q = `site:quora.com ((${quoted}) OR (${tokenOr}))`;

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
          `SerpAPI HTTP ${res.status}. Key inválida o sin créditos en esa cuenta.`,
        query: q,
        keyConfigured: true,
      };
    }

    const organic = data.organic_results ?? [];
    if (organic.length === 0) {
      return {
        hits: [],
        error: `SerpAPI OK (key funciona) pero Google no indexó nada para: ${clean.slice(0, 3).join(", ")}. Probá keywords más cortas tipo "iptv" / "fire stick".`,
        query: q,
        keyConfigured: true,
      };
    }

    const hits: QuoraHit[] = [];
    const seen = new Set<string>();
    let dropped = 0;

    for (const row of organic) {
      const url = row.link?.trim() ?? "";
      if (!url.includes("quora.com") || seen.has(url)) continue;
      seen.add(url);

      const title = (row.title ?? "").trim();
      if (!title) continue;
      const snippet = (row.snippet ?? "").trim();
      const haystack = `${title}\n${snippet}`;

      if (!matchesKeywordsOrTokens(haystack, clean, tokens)) {
        dropped++;
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
          ? `Google trajo ${organic.length} links Quora; ${dropped} no matchearon tus keywords. Activá frases con “iptv” / “fire stick”.`
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

function extractTokens(phrases: string[]): string[] {
  const out = new Set<string>();
  for (const phrase of phrases) {
    for (const raw of normalize(phrase).split(/\s+/)) {
      if (raw.length < 4) continue;
      if (STOPWORDS.has(raw)) continue;
      out.add(raw);
    }
  }
  return [...out];
}

function matchesKeywordsOrTokens(
  haystackRaw: string,
  phrases: string[],
  tokens: string[],
): boolean {
  const haystack = normalize(haystackRaw);
  // Full phrase match first.
  for (const phrase of phrases) {
    const needle = normalize(phrase);
    if (needle.length >= 3 && haystack.includes(needle)) return true;
  }
  // Then any meaningful token (iptv, firestick, tivimate…).
  for (const token of tokens) {
    if (haystack.includes(token)) return true;
  }
  return false;
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
