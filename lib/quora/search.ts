/**
 * Quora lead discovery via SerpAPI Google (`site:quora.com`).
 *
 * Runs several Google queries (per keyword + loose tokens + optional page 2)
 * to surface more than a single top-10 SERP. Mixes recent (past year) and
 * unfiltered queries so volume stays high without only ancient evergreen threads.
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
  /** How many SerpAPI requests this search burned. */
  serpCalls: number;
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

/** Soft cap so one scan does not burn the whole SerpAPI month. */
const MAX_SERP_CALLS = 12;
const RESULTS_PER_PAGE = 20;

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
      serpCalls: 0,
    };
  }

  const clean = [
    ...new Set(phrases.map((p) => p.trim()).filter((p) => p.length >= 3)),
  ].slice(0, 10);

  if (clean.length === 0) {
    return {
      hits: [],
      error: "No hay keywords activas. Andá a Keywords y activá/sembrá frases.",
      query: "",
      keyConfigured: true,
      serpCalls: 0,
    };
  }

  const tokens = extractTokens(clean);
  const jobs = buildSearchJobs(clean, tokens);

  const allOrganic: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }> = [];
  const queryLog: string[] = [];
  let serpCalls = 0;
  let lastError: string | null = null;

  for (const job of jobs) {
    if (serpCalls >= MAX_SERP_CALLS) break;

    const result = await fetchSerpGoogle(apiKey, job.q, job.tbs, job.start);
    serpCalls++;
    queryLog.push(job.label);

    if (result.error) {
      lastError = result.error;
      // Auth/credit failures: stop burning calls.
      if (/invalid|credit|quota|unauthorized|api key/i.test(result.error)) {
        break;
      }
      continue;
    }

    allOrganic.push(...result.organic);
  }

  if (allOrganic.length === 0) {
    return {
      hits: [],
      error:
        lastError ||
        `SerpAPI OK pero Google no indexó nada para: ${clean.slice(0, 4).join(", ")}. Probá más keywords cortas.`,
      query: queryLog.join(" | "),
      keyConfigured: true,
      serpCalls,
    };
  }

  const hits: QuoraHit[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const row of allOrganic) {
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
        ? `Google trajo ${allOrganic.length} links Quora; ${dropped} no matchearon tus keywords (${serpCalls} calls).`
        : lastError && hits.length < 5
          ? `Parcial: ${hits.length} hits. Último aviso SerpAPI: ${lastError}`
          : null,
    query: queryLog.join(" | "),
    keyConfigured: true,
    serpCalls,
  };
}

type SearchJob = {
  q: string;
  tbs?: string;
  start: number;
  label: string;
};

function buildSearchJobs(phrases: string[], tokens: string[]): SearchJob[] {
  const jobs: SearchJob[] = [];

  // 1) One query per keyword (past year) — fresher + more coverage.
  for (const phrase of phrases) {
    const safe = phrase.replace(/"/g, "");
    jobs.push({
      q: `site:quora.com "${safe}"`,
      tbs: "qdr:y",
      start: 0,
      label: `y:"${safe}"`,
    });
  }

  // 2) Same top phrases without date filter (evergreen volume).
  for (const phrase of phrases.slice(0, 4)) {
    const safe = phrase.replace(/"/g, "");
    jobs.push({
      q: `site:quora.com "${safe}"`,
      start: 0,
      label: `all:"${safe}"`,
    });
  }

  // 3) Loose token OR (iptv OR firestick…) past year + page 2 if needed.
  const tokenOr =
    tokens.length > 0
      ? tokens.slice(0, 8).join(" OR ")
      : "iptv OR firestick OR \"android tv\"";
  jobs.push({
    q: `site:quora.com (${tokenOr})`,
    tbs: "qdr:y",
    start: 0,
    label: `tokens:y`,
  });
  jobs.push({
    q: `site:quora.com (${tokenOr})`,
    tbs: "qdr:y",
    start: 10,
    label: `tokens:y:p2`,
  });
  jobs.push({
    q: `site:quora.com (${tokenOr})`,
    start: 0,
    label: `tokens:all`,
  });

  return jobs.slice(0, MAX_SERP_CALLS);
}

async function fetchSerpGoogle(
  apiKey: string,
  q: string,
  tbs: string | undefined,
  start: number,
): Promise<{
  organic: Array<{ title?: string; link?: string; snippet?: string }>;
  error: string | null;
}> {
  const params = new URLSearchParams({
    engine: "google",
    q,
    hl: "es",
    gl: "mx",
    num: String(RESULTS_PER_PAGE),
    api_key: apiKey,
  });
  if (tbs) params.set("tbs", tbs);
  if (start > 0) params.set("start", String(start));

  try {
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
        organic: [],
        error: `SerpAPI cuerpo no-JSON (HTTP ${res.status}).`,
      };
    }

    if (!res.ok || data.error) {
      return {
        organic: [],
        error:
          data.error ||
          `SerpAPI HTTP ${res.status}. Key inválida o sin créditos.`,
      };
    }

    return { organic: data.organic_results ?? [], error: null };
  } catch (error) {
    return {
      organic: [],
      error: error instanceof Error ? error.message : String(error),
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
  for (const phrase of phrases) {
    const needle = normalize(phrase);
    if (needle.length >= 3 && haystack.includes(needle)) return true;
  }
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
