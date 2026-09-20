import { createServiceClient, type SupabaseServiceClient } from "@/lib/supabase/service";
import type {
  Database,
  DetectedLead,
  Keyword,
  UserSettings,
} from "@/lib/supabase/types";
import {
  DEFAULT_SUBREDDITS,
  fetchSubredditComments,
  fetchSubredditPosts,
  type RedditPost,
} from "@/lib/reddit/fetcher";
import { sendTelegramLeadNotification } from "@/lib/telegram/bot";
import {
  analyzeRedditPost,
  type RedditPostAnalysis,
} from "@/lib/ai/gemini";

/** Threshold above which a lead is worth alerting the user about. */
const ALERT_INTENT_SCORE = 7;

/**
 * Runs the full lead-generation pipeline for a single user.
 *
 * Cost-optimized flow:
 *   1. Load the user's credentials and active keywords.
 *   2. Global dedupe of subreddits: group keywords by unique (normalized)
 *      subreddit so we fetch each subreddit's RSS ONCE per scan.
 *   3. Drop known-dead subreddits early (e.g. r/IPTV, r/IPTVReviews) that 404
 *      and would waste a ScraperAPI credit.
 *   4. For each subreddit: fetch posts RSS + recent comments listing once,
 *      keyword-filter locally and run Gemini on matching items.
 *
 * Quora is intentionally NOT included here — use the dashboard "Escanear Quora"
 * progressive mode (or /api/scan?mode=quora) so SerpAPI spend stays opt-in.
 *
 * @param userId The authenticated user's UUID.
 * @returns      A summary of posts fetched, stored, alerted, and skipped.
 */
export async function runLeadGenerationPipelineForUser(
  userId: string,
): Promise<PipelineSummary> {
  const supabase = createServiceClient();

  const settings = await loadUserSettings(supabase, userId);

  const keywords = await loadActiveKeywords(supabase, userId);
  if (keywords.length === 0) {
    return {
      fetched: 0,
      stored: 0,
      alerted: 0,
      skippedDedupe: 0,
      skippedFilter: 0,
    };
  }

  // Load the user's existing lead ids once up front to dedupe across keywords.
  const existingPostIds = await loadExistingPostIds(supabase, userId);

  const summary: PipelineSummary = {
    fetched: 0,
    stored: 0,
    alerted: 0,
    skippedDedupe: 0,
    skippedFilter: 0,
  };

  // Group active keywords by normalized subreddit, skipping dead subreddits.
  const bySubreddit = groupKeywordsBySubreddit(keywords);

  // Process each unique subreddit concurrently (1 fetch each, cached), with a
  // bounded concurrency to avoid hammering external APIs.
  const entries = [...bySubreddit.entries()];
  const results = await mapWithConcurrency(
    entries,
    ([sub, subsKeywords]) =>
      processSubreddit(
        supabase,
        userId,
        sub,
        subsKeywords,
        settings,
        existingPostIds,
        summary,
      ),
    MAX_CONCURRENT_SUBREDDITS,
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result && result.status === "rejected") {
      const sub = entries[i]?.[0];
      console.error(
        `[pipeline] Error procesando r/${sub ?? "?"} para ${userId}:`,
        result.reason,
      );
    }
  }

  return summary;
}

/** Max concurrent subreddit fetches. Kept low to respect rate limits. */
const MAX_CONCURRENT_SUBREDDITS = 2;

/**
 * Subreddits known to 404 / be dead; skip to avoid wasting API credits.
 *
 * These are not part of the active target list but may still be referenced by
 * legacy keyword rows in the database, so they are blocked here to prevent
 * burning a ScraperAPI credit on a 404. `iptv` was validated-activo by
 * `npm run check-subreddits`, so it was removed from this set (it is now part
 * of `DEFAULT_SUBREDDITS`). `firestickhacks` was removed entirely (verified
 * nonexistent).
 */
const BLOCKED_SUBREDDITS = new Set(["iptvreviews", "firestickhacks"]);

/** Normalizes a subreddit to a lowercase bare name (no `r/` prefix). */
function normalizeSubreddit(subreddit: string): string {
  return subreddit.trim().replace(/^r\//, "").toLowerCase() || "all";
}

/**
 * Groups active keywords by their normalized subreddit, dropping subreddits
 * that are known to be dead/invalid so we never spend a credit on them.
 *
 * Keywords targeting `all` are expanded across `DEFAULT_SUBREDDITS` (the
 * validated sales niche list) instead of scraping r/all, which is noisy and
 * expensive.
 *
 * @returns A `Map` of normalized subreddit -> its keywords.
 */
function groupKeywordsBySubreddit(
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
): Map<string, Pick<Keyword, "id" | "phrase" | "subreddit">[]> {
  const groups = new Map<
    string,
    Pick<Keyword, "id" | "phrase" | "subreddit">[]
  >();

  for (const keyword of keywords) {
    const sub = normalizeSubreddit(keyword.subreddit);
    const targets =
      sub === "all"
        ? DEFAULT_SUBREDDITS.map((s) => s.toLowerCase())
        : [sub];

    for (const target of targets) {
      if (BLOCKED_SUBREDDITS.has(target)) {
        console.warn(
          `[pipeline] Se omite r/${target} (subreddit no válido/404) para evitar gastar crédito.`,
        );
        continue;
      }
      const list = groups.get(target);
      if (list) {
        list.push(keyword);
      } else {
        groups.set(target, [keyword]);
      }
    }
  }

  return groups;
}

/**
 * Maps an array through an async worker with a bounded concurrency limit.
 *
 * Returns the outcome of every task (fulfilled or rejected) in input order, so
 * callers can handle each failure independently without aborting the batch.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const item = items[index];
      try {
        // index is guaranteed in-bounds by the guard above.
        const value = await worker(item as T);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

/** Loads the user's settings, or an empty-ish fallback when absent. */
async function loadUserSettings(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Partial<UserSettings>> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "telegram_bot_token, telegram_chat_id, gemini_api_key, is_active",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[pipeline] No se pudo leer user_settings de ${userId}: ${error.message}`,
    );
  }
  return data ?? {};
}

/** Loads the user's active keywords. */
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
    throw new Error(
      `[pipeline] No se pudieron cargar keywords de ${userId}: ${error.message}`,
    );
  }
  return data ?? [];
}

/** Loads all previously stored Reddit post ids for the user (dedup set). */
async function loadExistingPostIds(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("detected_leads")
    .select("reddit_post_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `[pipeline] No se pudieron leer leads existentes de ${userId}: ${error.message}`,
    );
  }

  return new Set((data ?? []).map((row) => row.reddit_post_id));
}

/**
 * Processes one unique subreddit: posts (RSS) + recent comments (comments.json).
 * One ScraperAPI credit per listing type per sub (cached 5 min). Mutates `summary`.
 */
async function processSubreddit(
  supabase: SupabaseServiceClient,
  userId: string,
  subreddit: string,
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
): Promise<void> {
  if (keywords.length === 0) return;

  const [posts, comments] = await Promise.all([
    fetchSubredditPosts(subreddit),
    fetchSubredditComments(subreddit),
  ]);

  summary.fetched += posts.length + comments.length;
  console.log(
    `[pipeline] r/${subreddit}: ${posts.length} posts + ${comments.length} comentarios`,
  );

  const items: Array<{ item: RedditPost; kind: "post" | "comment" }> = [
    ...posts.map((item) => ({ item, kind: "post" as const })),
    ...comments.map((item) => ({ item, kind: "comment" as const })),
  ];

  for (const keyword of keywords) {
    for (const { item, kind } of items) {
      await processMatchedItem(
        supabase,
        userId,
        item,
        kind,
        keyword,
        settings,
        existingPostIds,
        summary,
      );
    }
  }
}

/**
 * Keyword-match → Gemini → save/notify for a single post or comment.
 */
async function processMatchedItem(
  supabase: SupabaseServiceClient,
  userId: string,
  item: RedditPost,
  kind: "post" | "comment",
  keyword: Pick<Keyword, "id" | "phrase">,
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
): Promise<void> {
  if (existingPostIds.has(item.reddit_post_id)) {
    summary.skippedDedupe++;
    return;
  }

  if (!matchesKeyword(item, keyword.phrase)) {
    summary.skippedFilter++;
    return;
  }

  const apiKey = settings.gemini_api_key ?? undefined;
  let analysis: RedditPostAnalysis;
  try {
    analysis = await analyzeRedditPost(
      item.title,
      item.content ?? "",
      keyword.phrase,
      apiKey,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[pipeline] Omitiendo ${kind} "${truncate(item.title)}" (r/${item.subreddit}) por fallo de Gemini: ${message}`,
    );
    return;
  }

  console.log(
    `[AI] ${kind === "comment" ? "Comentario" : "Post"} "${truncate(item.title)}" match "${keyword.phrase}" -> Score: ${analysis.intent_score}/10`,
  );

  const status =
    analysis.intent_score >= ALERT_INTENT_SCORE ? "notified" : "archived";

  const lead = await saveLead(supabase, {
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
  });

  summary.stored++;
  existingPostIds.add(item.reddit_post_id);

  if (status === "notified") {
    await notifyUser(settings, lead, keyword.phrase);
    summary.alerted++;
  }
}

/**
 * Persists a new lead row and returns the stored record.
 */
async function saveLead(
  supabase: SupabaseServiceClient,
  insert: Database["public"]["Tables"]["detected_leads"]["Insert"],
): Promise<DetectedLead> {
  const { data, error } = await supabase
    .from("detected_leads")
    .insert(insert)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`[pipeline] No se pudo guardar el lead: ${error?.message ?? "sin data"}`);
  }
  return data;
}

/**
 * Sends the Telegram alert. Failures are logged but non-fatal so the pipeline
 * still considers the post processed.
 */
async function notifyUser(
  settings: Partial<UserSettings>,
  lead: DetectedLead,
  keyword: string,
): Promise<void> {
  const token = settings.telegram_bot_token;
  const chatId = settings.telegram_chat_id;

  if (!token || !chatId) {
    console.warn(
      `[pipeline] Usuario ${lead.user_id} sin Telegram configurado; lead guardado sin alerta.`,
    );
    return;
  }

  try {
    await sendTelegramLeadNotification(token.trim(), chatId.trim(), lead, keyword);
  } catch (error) {
    console.error(
      `[pipeline] Falló la notificación de Telegram para el lead ${lead.id}:`,
      error,
    );
  }
}

/**
 * Case-insensitive keyword match against title/content.
 *
 * Multi-word phrases use normalized accent-insensitive substring match (better
 * for Spanish: "iptv méxico" ≈ "iptv mexico"). Single-token phrases still use
 * word boundaries to avoid false positives inside longer words.
 */
function matchesKeyword(post: RedditPost, phrase: string): boolean {
  const haystack = normalizeForMatch(
    `${post.title}\n${post.content ?? ""}`,
  );
  const needle = normalizeForMatch(phrase.trim());
  if (!needle) return false;

  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return haystack.includes(needle);
  }

  const escaped = escapeRegExp(tokens[0] ?? "");
  if (!escaped) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:[^\\p{L}\\p{N}_]|$)`, "iu").test(
    haystack,
  );
}

/** Lowercase + strip combining accents for Spanish-tolerant matching. */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapes regex metacharacters so a literal user keyword is matched verbatim. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Truncates a string for compact console logging. */
function truncate(value: string, maxLen: number = 80): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** Aggregated counters returned to the trigger caller. */
export type PipelineSummary = {
  fetched: number;
  stored: number;
  alerted: number;
  skippedDedupe: number;
  skippedFilter: number;
};

/**
 * Runs the pipeline for every user marked active in `user_settings`.
 *
 * Used by the background cron trigger. Per-user failures are isolated so one
 * user cannot block the remainder of the batch.
 *
 * @returns Per-user summaries keyed by user id.
 */
export async function runLeadGenerationPipelineForAllActiveUsers(): Promise<
  Record<string, PipelineSummary>
> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("user_settings")
    .select("id")
    .eq("is_active", true);

  if (error) {
    throw new Error(
      `[pipeline] No se pudo listar usuarios activos: ${error.message}`,
    );
  }

  const results: Record<string, PipelineSummary> = {};
  const userIds = (data ?? []).map((row) => row.id);

  for (const userId of userIds) {
    try {
      results[userId] = await runLeadGenerationPipelineForUser(userId);
    } catch (runError) {
      console.error(
        `[pipeline] La ejecución para ${userId} falló en el cron:`,
        runError,
      );
    }
  }

  return results;
}
