"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import {
  researchKeywordsWithGemini,
  type KeywordCandidate,
  type KeywordResearchResult,
} from "@/lib/ai/keyword-research";
import {
  fetchGoogleTrendsEnrichment,
  mergeTrendsIntoCandidates,
} from "@/lib/trends/serpapi";
import {
  DEFAULT_SUBREDDITS,
  fetchSubredditPosts,
} from "@/lib/reddit/fetcher";

export type ResearchActionResult = {
  ok: boolean;
  message: string;
  result: KeywordResearchResult | null;
};

export type ApplyResearchResult = {
  ok: boolean;
  message: string;
  added: number;
};

const DEFAULT_NICHE = "IPTV Fire Stick Latinoamérica español México Argentina Colombia";

/**
 * Runs in-app keyword research (Gemini + optional Google Trends via SerpAPI).
 *
 * Grounds the model with recent Reddit titles from `DEFAULT_SUBREDDITS` so
 * suggestions mirror real language in the niche — Semrush-style, not guesses.
 */
export async function runKeywordResearch(
  nicheSeed?: string,
): Promise<ResearchActionResult> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data: settings } = await supabase
    .from("user_settings")
    .select("gemini_api_key")
    .eq("id", userId)
    .maybeSingle();

  const niche = (nicheSeed?.trim() || DEFAULT_NICHE).slice(0, 200);
  const notes: string[] = [];

  let sampleTitles: string[] = [];
  try {
    sampleTitles = await collectSampleTitles(3);
    notes.push(`Muestras Reddit: ${sampleTitles.length} títulos recientes.`);
  } catch (error) {
    notes.push(
      `No se pudieron muestrear posts Reddit: ${
        error instanceof Error ? error.message : String(error)
      }. Se investiga igual con Gemini.`,
    );
  }

  try {
    const base = await researchKeywordsWithGemini(
      niche,
      sampleTitles,
      settings?.gemini_api_key ?? undefined,
    );

    const enrichment = await fetchGoogleTrendsEnrichment(
      "IPTV Fire Stick México",
      base.candidates.map((c) => c.phrase),
    );
    notes.push(...enrichment.notes);

    const candidates = mergeTrendsIntoCandidates(
      base.candidates,
      enrichment,
    );
    const trendsEnriched = enrichment.relatedRising.length > 0
      || Object.keys(enrichment.interestByPhrase).length > 0;

    const result: KeywordResearchResult = {
      niche: base.niche,
      candidates,
      trendsEnriched,
      notes,
    };

    return {
      ok: true,
      message: trendsEnriched
        ? `${candidates.length} keywords (Gemini + Google Trends).`
        : `${candidates.length} keywords (Gemini). Añade SERPAPI_KEY para Trends.`,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[keyword-research] runKeywordResearch falló:", error);
    return { ok: false, message, result: null };
  }
}

/**
 * Inserts selected researched phrases as active keywords for the current user.
 * Skips duplicates (same phrase + subreddit).
 */
export async function applyResearchedKeywords(
  selected: Array<Pick<KeywordCandidate, "phrase" | "suggested_subreddit">>,
): Promise<ApplyResearchResult> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  if (!Array.isArray(selected) || selected.length === 0) {
    return { ok: false, message: "No hay keywords seleccionadas.", added: 0 };
  }

  const normalized = selected
    .map((row) => ({
      phrase: row.phrase.trim().slice(0, 200),
      subreddit:
        (row.suggested_subreddit || "all").trim().replace(/^r\//i, "") || "all",
    }))
    .filter((row) => row.phrase.length >= 2);

  if (normalized.length === 0) {
    return { ok: false, message: "Selección inválida.", added: 0 };
  }

  const { data: existing, error: loadError } = await supabase
    .from("keywords")
    .select("phrase, subreddit")
    .eq("user_id", userId);

  if (loadError) {
    console.error("[keyword-research] apply: load falló:", loadError);
    return { ok: false, message: "No se pudieron leer keywords existentes.", added: 0 };
  }

  const have = new Set(
    (existing ?? []).map(
      (k) => `${k.phrase.toLowerCase()}|${k.subreddit.toLowerCase()}`,
    ),
  );

  const rows = normalized
    .filter(
      (row) =>
        !have.has(`${row.phrase.toLowerCase()}|${row.subreddit.toLowerCase()}`),
    )
    .map((row) => ({
      user_id: userId,
      phrase: row.phrase,
      subreddit: row.subreddit,
      is_active: true,
    }));

  if (rows.length === 0) {
    return {
      ok: true,
      message: "Todas las seleccionadas ya estaban en tu lista.",
      added: 0,
    };
  }

  const { error } = await supabase.from("keywords").insert(rows);
  if (error) {
    console.error("[keyword-research] apply insert falló:", error);
    return { ok: false, message: "No se pudieron guardar las keywords.", added: 0 };
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${rows.length} keywords activadas en el monitoreo.`,
    added: rows.length,
  };
}

/** Pulls a few recent titles from the first N default subreddits. */
async function collectSampleTitles(maxSubs: number): Promise<string[]> {
  const titles: string[] = [];
  const subs = DEFAULT_SUBREDDITS.slice(0, maxSubs);
  for (const sub of subs) {
    const posts = await fetchSubredditPosts(sub, 10);
    for (const post of posts) {
      if (post.title) titles.push(post.title);
    }
  }
  return titles;
}
