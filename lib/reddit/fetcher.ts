/**
 * Reddit ingestion helpers.
 *
 * Fetches the newest posts from a subreddit via Reddit's public JSON API and
 * normalizes them into a typed shape that the lead pipeline can consume.
 */

/** A normalized Reddit post used by the lead detection pipeline. */
export type RedditPost = {
  reddit_post_id: string;
  title: string;
  content: string | null;
  author: string | null;
  post_url: string;
  subreddit: string;
};

/** Browser-like User-Agent to avoid Reddit's automated-traffic blocks. */
const REDDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Full browser-style headers used for scraping requests. */
const REDDIT_HEADERS: Record<string, string> = {
  "User-Agent": REDDIT_USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Per-attempt max wait before aborting a single HTTP request. */
const FETCH_TIMEOUT_MS = 5000;

/** Rate-limit statuses we treat as retryable via exponential backoff. */
const RETRYABLE_STATUS = new Set([429, 403, 503]);

/** Max retries for rate-limited/transient requests (besides the first call). */
const MAX_RETRIES = 3;

/** Base backoff (ms) doubled on each retry: 1000, 2000, 4000. */
const BACKOFF_BASE_MS = 1000;

/** Randomized politeness delay range (ms) between sequential scrapes. */
const REQUEST_GAP_MIN_MS = 1500;
const REQUEST_GAP_MAX_MS = 2000;

/**
 * Spaces the scraping requests out so we don't hammer Reddit/PullPush.
 *
 * The previous completion time is awaited too, so concurrent callers are
 * serialized into a polite queue (each fires at least gap-ms after the last).
 */
let lastRequestAt = 0;

async function throttleNextRequest(): Promise<void> {
  const gap = randBetween(REQUEST_GAP_MIN_MS, REQUEST_GAP_MAX_MS);
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < gap) {
    await sleep(gap - elapsed);
  }
  lastRequestAt = Date.now();
}

/**
 * Fetches posts for a subreddit, mirroring Reddit's JSON API.
 *
 * Attempts Reddit's native JSON first with full browser-like headers. When the
 * CDN blocks or rate-limits us (status 403/429), it falls back to the PullPush
 * (Pushshift mirror) API so scanning can continue without losing that
 * subreddit's leads. Requests are spaced 1.5-2s apart and rate-limited
 * responses are retried with exponential backoff.
 *
 * @param subreddit Subreddit name (e.g. `marketing`, `entrepreneur`).
 * @param limit     Number of posts to fetch (default 25, max 100).
 * @param keyword   Keyword phrase used only for the PullPush fallback query.
 * @returns         Normalized array of the newest posts.
 */
export async function fetchSubredditPosts(
  subreddit: string,
  limit: number = 25,
  keyword?: string,
): Promise<RedditPost[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const sub = subreddit.trim().replace(/^r\//, "") || "all";
  const url = `https://www.reddit.com/r/${encodeURIComponent(
    sub,
  )}/new.json?limit=${safeLimit}`;

  const response = await fetchWithRetry(() => fetchWithTimeout(url, REDDIT_HEADERS));

  // Gracefully fall back to PullPush when Reddit's CDN blocks/rate-limits us.
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      console.warn(
        `[reddit] r/${sub} respondió ${response.status}; probando fallback PullPush.`,
      );
      return fetchPullPushPosts(sub, safeLimit, keyword);
    }
    throw new Error(`Reddit API returned ${response.status} for r/${sub}`);
  }

  const payload = (await response.json()) as RedditListingResponse;
  return mapListingToPosts(payload, sub);
}

/**
 * Fetches posts via the PullPush (Pushshift mirror) API as a fallback when
 * Reddit's raw JSON endpoint blocks automated scraping.
 *
 * @param subreddit Subreddit to scope the keyword search to.
 * @param limit     Max results (default 25, capped at 100).
 * @param keyword   Keyword phrase to query against (required).
 * @returns         Normalized array of matching posts.
 */
async function fetchPullPushPosts(
  subreddit: string,
  limit: number,
  keyword?: string,
): Promise<RedditPost[]> {
  const q = keyword?.trim();
  if (!q) {
    console.warn("[reddit] Fallback PullPush requiere una keyword; se omite.");
    return [];
  }

  const safeSize = Math.max(1, Math.min(100, Math.trunc(limit)));
  const params = new URLSearchParams({
    q,
    subreddit,
    size: String(safeSize),
  });
  const url = `https://api.pullpush.io/reddit/search/submission/?${params.toString()}`;

  const response = await fetchWithRetry(() =>
    fetchWithTimeout(url, REDDIT_HEADERS),
  );
  if (!response.ok) {
    console.error(`[reddit] PullPush respondió ${response.status}; se omite.`);
    return [];
  }

  const payload = (await response.json()) as PullPushResponse;
  return mapPullPushToPosts(payload, subreddit);
}

/**
 * Fetches a URL once, honoring the politeness throttle and per-attempt timeout.
 * Rate-limit/transient responses are handled by the outer retry loop.
 */
async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  await throttleNextRequest();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers,
      // Default to fresh data; feeds are fetched per scan.
      cache: "no-store",
    });
  } catch (error) {
    console.error(`[reddit] Error de red en ${url}:`, error);
    // Return a synthetic response so callers treat failures as non-OK instead
    // of a thrown exception halting the pipeline.
    return new Response(null, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Retries an HTTP fetch with exponential backoff when the response is
 * rate-limited (429/403/503), so transient blocks resolve before giving up.
 *
 * @param request A thunk returning a `Response` (already handled by
 *                `fetchWithTimeout`), so each attempt re-throttles.
 */
async function fetchWithRetry(
  request: () => Promise<Response>,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await request();

    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
      // Jitter up to 500ms to avoid synchronized retry bursts across keyword.
      const wait = backoff + randBetween(0, 500);
      console.warn(
        `[reddit] Status ${response.status}; reintentando en ${wait}ms (intento ${attempt + 1}/${MAX_RETRIES}).`,
      );
      await sleep(wait);
      attempt++;
      continue;
    }

    return response;
  }
}

/** Resolves after a randomized delay between `min` and `max` ms. */
function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maps Reddit's listing JSON into normalized posts. Ignores non-post entries
 * (e.g. promoted/ads or comments) and safely handles missing fields.
 */
function mapListingToPosts(
  payload: RedditListingResponse,
  subreddit: string,
): RedditPost[] {
  const children = payload?.data?.children;
  if (!Array.isArray(children)) {
    return [];
  }

  const posts: RedditPost[] = [];

  for (const child of children) {
    if (child?.kind !== "t3") {
      continue; // skip comments, ads, and malformed entries
    }

    const post = child?.data;
    if (!post) {
      continue;
    }

    const title = typeof post.title === "string" ? post.title : "";
    if (!title) {
      continue;
    }

    const redditPostId = typeof post.id === "string" ? post.id : "";
    if (!redditPostId) {
      continue;
    }

    const permalink = typeof post.permalink === "string" ? post.permalink : "";
    posts.push({
      reddit_post_id: redditPostId,
      title,
      content:
        typeof post.selftext === "string" && post.selftext
          ? post.selftext
          : null,
      author: typeof post.author === "string" ? post.author : null,
      post_url:
        permalink.startsWith("http")
          ? permalink
          : `https://www.reddit.com${permalink}`,
      subreddit:
        typeof post.subreddit === "string" ? post.subreddit : subreddit,
    });
  }

  return posts;
}

/**
 * Maps a PullPush submission response into normalized posts. Handles the
 * `data.data` array shape and safely skips entries missing required fields.
 */
function mapPullPushToPosts(
  payload: PullPushResponse,
  subreddit: string,
): RedditPost[] {
  const items = payload?.data;
  if (!Array.isArray(items)) {
    return [];
  }

  const posts: RedditPost[] = [];

  for (const item of items) {
    const title = typeof item.title === "string" ? item.title : "";
    if (!title) {
      continue;
    }

    const redditPostId = typeof item.id === "string" ? item.id : "";
    if (!redditPostId) {
      continue;
    }

    const permalink =
      typeof item.permalink === "string" ? item.permalink : "";

    posts.push({
      reddit_post_id: redditPostId,
      title,
      content:
        typeof item.selftext === "string" && item.selftext
          ? item.selftext
          : null,
      author: typeof item.author === "string" ? item.author : null,
      post_url:
        permalink.startsWith("http")
          ? permalink
          : `https://www.reddit.com${permalink}`,
      subreddit:
        typeof item.subreddit === "string" ? item.subreddit : subreddit,
    });
  }

  return posts;
}

// ---------------------------------------------------------------------------
// Minimal structural types for Reddit's listing JSON
// ---------------------------------------------------------------------------

type RedditListingResponse = {
  data?: {
    children?: RedditChild[];
  };
};

type RedditChild = {
  kind?: string;
  data?: RedditPostData;
};

type RedditPostData = {
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  author?: unknown;
  permalink?: unknown;
  subreddit?: unknown;
};

// ---------------------------------------------------------------------------
// Minimal structural types for the PullPush (Pushshift mirror) API
// ---------------------------------------------------------------------------

type PullPushResponse = {
  data?: PullPushSubmission[];
};

type PullPushSubmission = {
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  author?: unknown;
  permalink?: unknown;
  subreddit?: unknown;
  created_utc?: unknown;
};
