import { createServiceClient, type SupabaseServiceClient } from "@/lib/supabase/service";
import type {
  DetectedLead,
  Keyword,
  UserSettings,
} from "@/lib/supabase/types";
import type { PipelineSummary } from "@/lib/pipeline/process-leads";
import type {
  ScanEvent,
  ScanMode,
} from "@/lib/pipeline/scan-types";
import {
  DEFAULT_SUBREDDITS,
  fetchSubredditComments,
  fetchSubredditPosts,
  type RedditPost,
} from "@/lib/reddit/fetcher";
import { sendTelegramLeadNotification } from "@/lib/telegram/bot";
import { analyzeRedditPost } from "@/lib/ai/gemini";
import { searchQuoraQuestions } from "@/lib/quora/search";

export type { ScanEvent, ScanLeadPreview, ScanMode } from "@/lib/pipeline/scan-types";

const ALERT_INTENT_SCORE = 7;
const BLOCKED_SUBREDDITS = new Set(["iptvreviews", "firestickhacks"]);

/**
 * Streams a progressive scan for one user. Safe to abort mid-flight.
 */
export async function* progressiveScan(
  userId: string,
  mode: ScanMode,
  signal?: AbortSignal,
): AsyncGenerator<ScanEvent> {
  const supabase = createServiceClient();
  const summary: PipelineSummary = {
    fetched: 0,
    stored: 0,
    alerted: 0,
    skippedDedupe: 0,
    skippedFilter: 0,
  };

  try {
    if (signal?.aborted) {
      yield { type: "done", summary, paused: true };
      return;
    }

    yield {
      type: "status",
      message:
        mode === "quora"
          ? "Preparando búsqueda en Quora…"
          : "Cargando keywords y leads ya vistos…",
    };

    const settings = await loadUserSettings(supabase, userId);
    const keywords = await loadActiveKeywords(supabase, userId);
    if (keywords.length === 0) {
      yield {
        type: "error",
        message: "No hay keywords activas. Sembrá o investigá keywords primero.",
      };
      yield { type: "done", summary, paused: false };
      return;
    }

    const existingPostIds = await loadExistingPostIds(supabase, userId);
    yield {
      type: "status",
      message: `${keywords.length} keywords · ${existingPostIds.size} leads ya en DB (se saltan para no quemar créditos)`,
    };

    if (mode === "quora") {
      yield* scanQuora(
        supabase,
        userId,
        keywords,
        settings,
        existingPostIds,
        summary,
        signal,
      );
    } else {
      yield* scanReddit(
        supabase,
        userId,
        keywords,
        settings,
        existingPostIds,
        summary,
        signal,
      );
    }

    const paused = Boolean(signal?.aborted);
    yield {
      type: "status",
      message: paused
        ? "Escaneo pausado. Lo encontrado ya quedó guardado."
        : "Escaneo terminado.",
    };
    yield { type: "done", summary, paused };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[progressive-scan] ${mode} falló:`, error);
    yield { type: "error", message };
    yield { type: "done", summary, paused: Boolean(signal?.aborted) };
  }
}

async function* scanReddit(
  supabase: SupabaseServiceClient,
  userId: string,
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
  signal?: AbortSignal,
): AsyncGenerator<ScanEvent> {
  const bySub = groupKeywordsBySubreddit(keywords);
  const entries = [...bySub.entries()];
  let step = 0;
  const totalSteps = Math.max(entries.length, 1);

  for (const [sub, subsKeywords] of entries) {
    if (signal?.aborted) return;

    step++;
    yield {
      type: "progress",
      current: step,
      total: totalSteps,
      label: `r/${sub}`,
      phase: "fetch",
    };
    yield {
      type: "status",
      message: `Descargando posts + comentarios de r/${sub} (${step}/${totalSteps})…`,
    };

    let posts: RedditPost[] = [];
    let comments: RedditPost[] = [];
    try {
      [posts, comments] = await Promise.all([
        fetchSubredditPosts(sub),
        fetchSubredditComments(sub),
      ]);
    } catch (error) {
      console.error(`[progressive-scan] fetch r/${sub}:`, error);
      yield {
        type: "status",
        message: `r/${sub} falló al descargar (se continúa con el siguiente).`,
      };
      continue;
    }

    const rawItems = [
      ...posts.map((item) => ({ item, kind: "post" as const })),
      ...comments.map((item) => ({ item, kind: "comment" as const })),
    ];
    summary.fetched += rawItems.length;

    // Credit saver: drop anything already in DB before keyword/Gemini work.
    const fresh = rawItems.filter(({ item }) => {
      if (existingPostIds.has(item.reddit_post_id)) {
        summary.skippedDedupe++;
        return false;
      }
      return true;
    });

    yield {
      type: "status",
      message: `r/${sub}: ${posts.length} posts + ${comments.length} comentarios · ${fresh.length} nuevos · ${rawItems.length - fresh.length} ya vistos (skip)`,
    };

    let idx = 0;
    for (const { item, kind } of fresh) {
      if (signal?.aborted) return;
      idx++;

      yield {
        type: "progress",
        current: idx,
        total: Math.max(fresh.length, 1),
        label: truncate(item.title, 60),
        phase: kind === "comment" ? "comentario" : "post",
      };

      const keyword = subsKeywords.find((k) =>
        matchesKeyword(item, k.phrase),
      );
      if (!keyword) {
        summary.skippedFilter++;
        continue;
      }

      yield {
        type: "status",
        message: `Analizando ${kind} con Gemini · match “${keyword.phrase}”…`,
      };

      const lead = await analyzeAndStore(
        supabase,
        userId,
        item,
        kind,
        keyword,
        settings,
        existingPostIds,
        summary,
      );
      if (lead) {
        yield {
          type: "lead",
          lead: {
            id: lead.id,
            title: lead.title,
            subreddit: lead.subreddit,
            post_url: lead.post_url,
            intent_score: lead.intent_score,
            status: lead.status,
            suggested_reply: lead.suggested_reply,
          },
        };
      }
    }
  }
}

async function* scanQuora(
  supabase: SupabaseServiceClient,
  userId: string,
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
  signal?: AbortSignal,
): AsyncGenerator<ScanEvent> {
  if (!process.env.SERPAPI_KEY?.trim()) {
    yield {
      type: "error",
      message:
        "Falta SERPAPI_KEY en Vercel para Quora (Google site:quora.com).",
    };
    return;
  }

  const phrases = [
    ...new Set(keywords.map((k) => k.phrase.trim()).filter(Boolean)),
  ].slice(0, 3);

  yield {
    type: "progress",
    current: 0,
    total: 1,
    label: "Quora via Google",
    phase: "search",
  };
  yield {
    type: "status",
    message: `Buscando en Quora: ${phrases.join(" · ")}`,
  };

  if (signal?.aborted) return;

  const result = await searchQuoraQuestions(phrases);
  if (result.error && result.hits.length === 0) {
    yield { type: "error", message: result.error };
    yield {
      type: "status",
      message: result.keyConfigured
        ? `Query: ${result.query.slice(0, 120)}…`
        : "Configurá SERPAPI_KEY en Vercel → Settings → Environment Variables → Redeploy.",
    };
    return;
  }

  const hits = result.hits;
  summary.fetched += hits.length;

  if (hits.length === 0) {
    yield {
      type: "status",
      message:
        result.error ??
        "Quora sin resultados. La key puede estar OK pero Google no indexó esas frases.",
    };
    return;
  }

  const fresh = hits.filter((h) => {
    if (existingPostIds.has(h.id)) {
      summary.skippedDedupe++;
      return false;
    }
    return true;
  });

  yield {
    type: "status",
    message: `Quora: ${hits.length} resultados · ${fresh.length} nuevos · ${hits.length - fresh.length} ya vistos`,
  };

  let idx = 0;
  for (const hit of fresh) {
    if (signal?.aborted) return;
    idx++;

    yield {
      type: "progress",
      current: idx,
      total: Math.max(fresh.length, 1),
      label: hit.title.slice(0, 60),
      phase: "quora",
    };

    const item: RedditPost = {
      reddit_post_id: hit.id,
      title: `[Quora] ${hit.title}`,
      content: hit.snippet,
      author: null,
      post_url: hit.url,
      subreddit: "quora",
    };

    const keyword =
      keywords.find((k) => matchesKeyword(item, k.phrase)) ?? keywords[0];
    if (!keyword) {
      summary.skippedFilter++;
      continue;
    }

    const lead = await analyzeAndStore(
      supabase,
      userId,
      item,
      "post",
      keyword,
      settings,
      existingPostIds,
      summary,
    );
    if (lead) {
      yield {
        type: "lead",
        lead: {
          id: lead.id,
          title: lead.title,
          subreddit: lead.subreddit,
          post_url: lead.post_url,
          intent_score: lead.intent_score,
          status: lead.status,
          suggested_reply: lead.suggested_reply,
        },
      };
    }
  }
}

async function analyzeAndStore(
  supabase: SupabaseServiceClient,
  userId: string,
  item: RedditPost,
  kind: "post" | "comment",
  keyword: Pick<Keyword, "id" | "phrase">,
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
): Promise<DetectedLead | null> {
  if (existingPostIds.has(item.reddit_post_id)) {
    summary.skippedDedupe++;
    return null;
  }

  let analysis;
  try {
    analysis = await analyzeRedditPost(
      item.title,
      item.content ?? "",
      keyword.phrase,
      settings.gemini_api_key ?? undefined,
    );
  } catch (error) {
    console.error(
      `[progressive-scan] Gemini falló en ${kind}:`,
      error,
    );
    return null;
  }

  // Junk / off-intent: persist as `rejected` so we don't re-spend Gemini, but
  // it won't clutter Todos/Archivados opportunity views.
  if (analysis.intent_score <= 3) {
    summary.skippedFilter++;
    const { data: rejected } = await supabase
      .from("detected_leads")
      .insert({
        user_id: userId,
        keyword_id: keyword.id,
        reddit_post_id: item.reddit_post_id,
        title: item.title,
        content: item.content,
        author: item.author,
        post_url: item.post_url,
        subreddit: item.subreddit,
        intent_score: analysis.intent_score,
        analysis_reasoning: analysis.analysis_reasoning,
        suggested_reply: analysis.suggested_reply,
        status: "rejected",
      })
      .select()
      .single();
    if (rejected) existingPostIds.add(item.reddit_post_id);
    console.log(
      `[progressive-scan] Rechazado score ${analysis.intent_score}/10: ${item.title.slice(0, 60)}`,
    );
    return null;
  }

  const status =
    analysis.intent_score >= ALERT_INTENT_SCORE ? "notified" : "archived";

  const { data, error } = await supabase
    .from("detected_leads")
    .insert({
      user_id: userId,
      keyword_id: keyword.id,
      reddit_post_id: item.reddit_post_id,
      title: item.title,
      content: item.content,
      author: item.author,
      post_url: item.post_url,
      subreddit: item.subreddit,
      intent_score: analysis.intent_score,
      analysis_reasoning: analysis.analysis_reasoning,
      suggested_reply: analysis.suggested_reply,
      status,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[progressive-scan] save lead:", error);
    return null;
  }

  summary.stored++;
  existingPostIds.add(item.reddit_post_id);

  if (status === "notified") {
    summary.alerted++;
    const token = settings.telegram_bot_token;
    const chatId = settings.telegram_chat_id;
    if (token && chatId) {
      try {
        await sendTelegramLeadNotification(
          token.trim(),
          chatId.trim(),
          data,
          keyword.phrase,
        );
      } catch (err) {
        console.error("[progressive-scan] telegram:", err);
      }
    }
  }

  return data;
}

function groupKeywordsBySubreddit(
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
): Map<string, Pick<Keyword, "id" | "phrase" | "subreddit">[]> {
  const groups = new Map<
    string,
    Pick<Keyword, "id" | "phrase" | "subreddit">[]
  >();

  for (const keyword of keywords) {
    const sub =
      keyword.subreddit.trim().replace(/^r\//i, "").toLowerCase() || "all";
    const targets =
      sub === "all"
        ? DEFAULT_SUBREDDITS.map((s) => s.toLowerCase())
        : [sub];

    for (const target of targets) {
      if (BLOCKED_SUBREDDITS.has(target)) continue;
      const list = groups.get(target);
      if (list) list.push(keyword);
      else groups.set(target, [keyword]);
    }
  }
  return groups;
}

function matchesKeyword(post: RedditPost, phrase: string): boolean {
  const haystack = normalizeForMatch(`${post.title}\n${post.content ?? ""}`);
  const needle = normalizeForMatch(phrase.trim());
  if (!needle) return false;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return haystack.includes(needle);
  const escaped = (tokens[0] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escaped}(?:[^\\p{L}\\p{N}_]|$)`,
    "iu",
  ).test(haystack);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLen: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

async function loadUserSettings(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Partial<UserSettings>> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("telegram_bot_token, telegram_chat_id, gemini_api_key, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[progressive-scan] settings: ${error.message}`);
  }
  return data ?? {};
}

async function loadActiveKeywords(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Pick<Keyword, "id" | "phrase" | "subreddit" | "user_id">[]> {
  const { data, error } = await supabase
    .from("keywords")
    .select("id, user_id, phrase, subreddit, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) {
    throw new Error(`[progressive-scan] keywords: ${error.message}`);
  }
  return data ?? [];
}

async function loadExistingPostIds(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("detected_leads")
    .select("reddit_post_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`[progressive-scan] leads: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.reddit_post_id));
}
