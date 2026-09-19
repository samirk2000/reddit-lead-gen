import type { KeywordCandidate } from "@/lib/ai/keyword-research";

/**
 * Optional Google Trends enrichment via SerpAPI.
 *
 * Requires `SERPAPI_KEY` in the environment. Without it, research still works
 * using Gemini alone — Trends just adds related rising queries + interest.
 *
 * Docs: https://serpapi.com/google-trends-api
 */

export type TrendsEnrichment = {
  relatedRising: string[];
  /** Average interest 0-100 for seed queries when available. */
  interestByPhrase: Record<string, number>;
  notes: string[];
};

/**
 * Fetches related rising queries for a seed topic and optional interest
 * averages for a batch of candidate phrases (max 5 per Trends request).
 */
export async function fetchGoogleTrendsEnrichment(
  seedTopic: string,
  candidatePhrases: string[],
): Promise<TrendsEnrichment> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  const notes: string[] = [];

  if (!apiKey) {
    return {
      relatedRising: [],
      interestByPhrase: {},
      notes: [
        "Google Trends omitido: define SERPAPI_KEY para enriquecer con Trends.",
      ],
    };
  }

  const relatedRising = await fetchRelatedRising(apiKey, seedTopic, notes);
  const interestByPhrase = await fetchInterestAverages(
    apiKey,
    candidatePhrases.slice(0, 5),
    notes,
  );

  return { relatedRising, interestByPhrase, notes };
}

/**
 * Merges Trends related rising queries into the Gemini candidate list
 * (as new high-intent rows when not already present).
 */
export function mergeTrendsIntoCandidates(
  candidates: KeywordCandidate[],
  enrichment: TrendsEnrichment,
): KeywordCandidate[] {
  const have = new Set(candidates.map((c) => c.phrase.toLowerCase()));
  const merged = [...candidates];

  for (const phrase of enrichment.relatedRising) {
    const clean = phrase.trim().slice(0, 200);
    if (!clean || clean.split(/\s+/).length < 2) continue;
    if (have.has(clean.toLowerCase())) continue;
    have.add(clean.toLowerCase());
    merged.push({
      phrase: clean,
      intent_score: 8,
      rationale: "Related rising query en Google Trends (demanda creciente).",
      suggested_subreddit: "all",
      trend: "rising",
    });
  }

  // Stamp interest onto existing candidates when we have averages.
  for (const c of merged) {
    const interest = enrichment.interestByPhrase[c.phrase.toLowerCase()];
    if (typeof interest === "number" && interest >= 60) {
      c.trend = "rising";
    }
  }

  return merged
    .sort((a, b) => b.intent_score - a.intent_score)
    .slice(0, 30);
}

async function fetchRelatedRising(
  apiKey: string,
  seedTopic: string,
  notes: string[],
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      engine: "google_trends",
      q: seedTopic.slice(0, 100),
      data_type: "RELATED_QUERIES",
      date: "today 3-m",
      api_key: apiKey,
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      notes.push(`Trends related queries HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      related_queries?: {
        rising?: Array<{ query?: string }>;
        top?: Array<{ query?: string }>;
      };
    };
    const rising = (data.related_queries?.rising ?? [])
      .map((r) => r.query?.trim() ?? "")
      .filter(Boolean);
    const top = (data.related_queries?.top ?? [])
      .map((r) => r.query?.trim() ?? "")
      .filter(Boolean);
    notes.push(
      `Trends: ${rising.length} rising + ${top.length} top related queries.`,
    );
    return [...rising, ...top].slice(0, 15);
  } catch (error) {
    notes.push(
      `Trends related queries error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

async function fetchInterestAverages(
  apiKey: string,
  phrases: string[],
  notes: string[],
): Promise<Record<string, number>> {
  if (phrases.length === 0) return {};
  try {
    // Trends accepts up to 5 comma-separated queries for TIMESERIES.
    const q = phrases.map((p) => p.slice(0, 100)).join(",");
    const params = new URLSearchParams({
      engine: "google_trends",
      q,
      data_type: "TIMESERIES",
      date: "today 3-m",
      api_key: apiKey,
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      notes.push(`Trends interest HTTP ${res.status}`);
      return {};
    }
    const data = (await res.json()) as {
      interest_over_time?: {
        averages?: Array<{ query?: string; value?: number | string }>;
      };
    };
    const out: Record<string, number> = {};
    for (const row of data.interest_over_time?.averages ?? []) {
      const query = row.query?.trim().toLowerCase();
      if (!query) continue;
      const value =
        typeof row.value === "number"
          ? row.value
          : Number.parseInt(String(row.value), 10);
      if (Number.isFinite(value)) out[query] = value;
    }
    notes.push(`Trends interest averages para ${Object.keys(out).length} frases.`);
    return out;
  } catch (error) {
    notes.push(
      `Trends interest error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {};
  }
}
