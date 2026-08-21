import { createServiceClient, type SupabaseServiceClient } from "@/lib/supabase/service";
import type {
  Database,
  DetectedLead,
  Keyword,
  UserSettings,
} from "@/lib/supabase/types";
import { fetchSubredditPosts, type RedditPost } from "@/lib/reddit/fetcher";
import { sendTelegramLeadNotification } from "@/lib/telegram/bot";
import { analyzeRedditPost } from "@/lib/ai/gemini";

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
 *   4. For each subreddit: fetch the feed once (in-memory cached for 5 min),
 *      then keyword-filter locally and run Gemini on matching posts.
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
    ([_sub, subsKeywords]) =>
      processSubreddit(
        supabase,
        userId,
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

/** Subreddits known to 404 / be dead; skip to avoid wasting API credits. */
const BLOCKED_SUBREDDITS = new Set(["iptv", "iptvreviews"]);

/** Normalizes a subreddit to a lowercase bare name (no `r/` prefix). */
function normalizeSubreddit(subreddit: string): string {
  return subreddit.trim().replace(/^r\//, "").toLowerCase() || "all";
}

/**
 * Groups active keywords by their normalized subreddit, dropping subreddits
 * that are known to be dead/invalid so we never spend a credit on them.
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
    if (BLOCKED_SUBREDDITS.has(sub)) {
      console.warn(
        `[pipeline] Se omite r/${sub} (subreddit no válido/404) para evitar gastar crédito.`,
      );
      continue;
    }
    const list = groups.get(sub);
    if (list) {
      list.push(keyword);
    } else {
      groups.set(sub, [keyword]);
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
 * Processes one unique subreddit. Does a SINGLE fetch of its RSS feed (backed
 * by the 5-minute in-memory cache) and then filters the posts locally against
 * each keyword that targets this subreddit, so one ScraperAPI credit covers
 * every keyword for it. Mutates `summary`.
 */
async function processSubreddit(
  supabase: SupabaseServiceClient,
  userId: string,
  keywords: Pick<Keyword, "id" | "phrase" | "subreddit">[],
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
): Promise<void> {
  if (keywords.length === 0) return;

  // ONE networked fetch per subreddit (cached in-memory for 5 min).
  const posts = await fetchSubredditPosts(keywords[0]!.subreddit);
  summary.fetched += posts.length;

  for (const keyword of keywords) {
    for (const post of posts) {
      if (existingPostIds.has(post.reddit_post_id)) {
        summary.skippedDedupe++;
        continue; // already processed
      }

      if (!matchesKeyword(post, keyword.phrase)) {
        summary.skippedFilter++;
        continue; // no keyword match
      }

      // Resolve per-user API key: settings.gemini_api_key first, env fallback
      // handled inside analyzeRedditPost.
      const apiKey = settings.gemini_api_key ?? undefined;

      const analysis = await analyzeRedditPost(
        post.title,
        post.content ?? "",
        keyword.phrase,
        apiKey,
      );

      const status = analysis.intent_score >= ALERT_INTENT_SCORE
        ? "notified"
        : "archived";

      const lead = await saveLead(supabase, {
        user_id: userId,
        keyword_id: keyword.id,
        reddit_post_id: post.reddit_post_id,
        title: post.title,
        content: post.content,
        author: post.author,
        post_url: post.post_url,
        subreddit: post.subreddit,
        intent_score: analysis.intent_score,
        analysis_reasoning: analysis.analysis_reasoning,
        suggested_reply: analysis.suggested_reply,
        status,
      });

      summary.stored++;
      existingPostIds.add(post.reddit_post_id);

      if (status === "notified") {
        await notifyUser(settings, lead, keyword.phrase);
        summary.alerted++;
      }
    }
  }
}

/** Persists a new lead row and returns the stored record. */
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

/** Case-insensitive keyword match against title or content. */
function matchesKeyword(post: RedditPost, phrase: string): boolean {
  const needle = phrase.toLowerCase();
  const haystack = `${post.title}\n${post.content ?? ""}`.toLowerCase();
  return haystack.includes(needle);
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
