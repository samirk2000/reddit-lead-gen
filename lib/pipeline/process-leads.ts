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
 * Flow:
 *   1. Load the user's credentials (`telegram_bot_token`, `telegram_chat_id`,
 *      `gemini_api_key`) from `user_settings`.
 *   2. Load the user's active keywords.
 *   3. For every keyword/subreddit combo: fetch new posts, dedupe against
 *      `detected_leads`, keyword-filter, run Gemini analysis, then save with
 *      status `notified` (plus Telegram alert) when score >= 7, else `archived`.
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

  // Iterate keyword combinations; catch per-keyword errors so one failure
  // doesn't abort the whole run.
  for (const keyword of keywords) {
    try {
      await processKeyword(
        supabase,
        userId,
        keyword,
        settings,
        existingPostIds,
        summary,
      );
    } catch (error) {
      console.error(
        `[pipeline] Error procesando keyword "${keyword.phrase}" de r/${keyword.subreddit} para ${userId}:`,
        error,
      );
    }
  }

  return summary;
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

/** Processes one keyword/subreddit combination and mutates `summary`. */
async function processKeyword(
  supabase: SupabaseServiceClient,
  userId: string,
  keyword: Pick<Keyword, "id" | "phrase" | "subreddit">,
  settings: Partial<UserSettings>,
  existingPostIds: Set<string>,
  summary: PipelineSummary,
): Promise<void> {
  const posts = await fetchSubredditPosts(keyword.subreddit);
  summary.fetched += posts.length;

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
