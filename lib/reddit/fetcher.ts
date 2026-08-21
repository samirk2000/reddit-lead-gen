/**
 * Reddit ingestion helpers.
 *
 * Fetches posts from a subreddit via Reddit's public RSS feeds (`new.rss`)
 * instead of the JSON API, which requires a registered bot in Reddit's
 * Developer Portal. Requests route through ScraperAPI (when a
 * `SCRAPER_API_KEY` is set) to bypass IP-level 429/403 blocks, else are made
 * directly. Normalized via `rss-parser` into the typed shape the lead
 * pipeline (and Gemini) consume.
 *
 * Resilience: timeouts/rate-limits are retried with backoff (max 2 retries),
 * and when the ScraperAPI premium path fails or times out we fall back to a
 * direct fetch to Reddit with a browser User-Agent before skipping a sub.
 */

import Parser from "rss-parser";

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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Browser-style headers used when fetching Reddit's RSS feed. */
const REDDIT_HEADERS: Record<string, string> = {
  "User-Agent": REDDIT_USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Public, active communities that serve RSS feeds reliably (IPTV/firestick niche). */
export const DEFAULT_SUBREDDITS = [
  "TiviMate",
  "AndroidTV",
  "FireStick",
  "samsungtv",
  "cordcutters",
] as const;

/**
 * Minimal headers for the ScraperAPI proxy. The key travels on the query
 * string, but we still pass a real browser User-Agent so Reddit doesn't treat
 * the downstream request as a bare datacenter bot.
 */
const SCRAPER_API_HEADERS: Record<string, string> = {
  "User-Agent": REDDIT_USER_AGENT,
  Accept: "application/xml, text/xml, */*;q=0.8",
};

/** Per-attempt max wait (ms) for direct Reddit requests. */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Per-attempt max wait (ms) when routing through ScraperAPI, which needs time
 * to rotate IPs and warm up before responding. Premium responses commonly take
 * 10-20s; a 30s ceiling avoids premature aborts while not hanging the scan.
 * Overridable via `SCRAPER_API_TIMEOUT_MS`.
 */
const FETCH_TIMEOUT_MS_SCRAPER_API = parseTimeoutEnv(
  process.env.SCRAPER_API_TIMEOUT_MS,
  30000,
);

/** Rate-limit statuses we treat as retryable via exponential backoff. */
const RETRYABLE_STATUS = new Set([429, 403, 503]);

/**
 * Max retries for retryable outcomes (rate-limited responses + timeouts),
 * besides the first attempt. Kept low so a dead subreddit doesn't stall the
 * scan: status/response retries follow this cap too.
 */
const MAX_RETRIES = 2;

/** Base backoff (ms) doubled on each retry: 1000, 2000, 4000. */
const BACKOFF_BASE_MS = 1000;

/** Randomized politeness delay range (ms) between sequential scrapes. */
const REQUEST_GAP_MIN_MS = 1500;
const REQUEST_GAP_MAX_MS = 2000;

/** Max RSS items to keep per subreddit feed. */
const DEFAULT_FEED_LIMIT = 25;

/** TTL for the in-memory subreddit feed cache (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory cache of recently fetched subreddit feeds so we don't burn a
 * ScraperAPI credit re-fetching the same subreddit within the TTL window.
 */
const feedCache = new Map<string, { posts: RedditPost[]; expiresAt: number }>();

/** Re-usable RSS parser instance (stateless once configured). */
const rssParser = new Parser<{ [key: string]: unknown }, RedditRssItem>({
  // Expose the raw content string so we can strip Reddit's SC_ON/SC_OFF markers.
  customFields: {
    item: ["content:encoded"],
  },
});

/**
 * Spaces the scraping requests out so we don't hammer Reddit.
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
 * Fetches the newest posts of a subreddit using Reddit's public RSS feed.
 *
 * Uses `www.reddit.com/r/{sub}/new.rss` (no Developer Portal registration
 * required) with real browser-style headers. Requests are spaced 1.5-2s apart,
 * rate-limited responses are retried with exponential backoff, and requests
 * route through ScraperAPI (with a 30s timeout) when a key is configured.
 *
 * @param subreddit Subreddit name (e.g. `marketing`, `entrepreneur`).
 * @param limit     Max items to return (default 25).
 * @param _keyword  Kept for signature compatibility with the pipeline.
 * @returns         Normalized array of the newest posts.
 */
export async function fetchSubredditPosts(
  subreddit: string,
  limit: number = DEFAULT_FEED_LIMIT,
  _keyword?: string,
): Promise<RedditPost[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  // Normalize a bare, clean sub name (no spaces, no `r/` prefix, trimmed);
  // default to a known-active community when the input is empty/blank.
  const sub = normalizeSubname(subreddit) || DEFAULT_SUBREDDITS[0] || "TiviMate";

  // Serve from the in-memory cache when fresh (5m TTL) to save ScraperAPI
  // credits on repeated scans of the same subreddit.
  const cached = feedCache.get(sub);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.posts.slice(0, safeLimit);
  }

  const posts = await fetchSubredditFeed(sub, safeLimit);

  // Cache the result (even empty/blocked feeds, so we don't immediately retry
  // a subreddit that transiently failed within the TTL window).
  feedCache.set(sub, { posts, expiresAt: Date.now() + CACHE_TTL_MS });

  return posts;
}

/**
 * Performs the actual networked fetch + parse for a single subreddit. Callers
 * wrap this with the in-memory cache (see `fetchSubredditPosts`).
 *
 * The subreddit name is expected to be already normalized (bare, no spaces, no
 * `r/` prefix) by `fetchSubredditPosts`.
 */
async function fetchSubredditFeed(sub: string, safeLimit: number): Promise<RedditPost[]> {
  // Reddit serves RSS at `/new.rss`; keep the trailing `.rss` so ScraperAPI
  // requests the feed and not the HTML site. Tested empirically: `www` (not
  // `old`) consistently returns the raw XML through ScraperAPI premium — `old`
  // would return the rendered HTML block page instead.
  const rssUrl = `https://www.reddit.com/r/${encodeURIComponent(
    sub,
  )}/new.rss`;

  if (process.env.SCRAPER_API_KEY?.trim()) {
    const viaProxy = await fetchSubredditFeedOnce(
      rssUrl,
      SCRAPER_API_HEADERS,
      FETCH_TIMEOUT_MS_SCRAPER_API,
      true, // wrap in ScraperAPI (premium) proxy
      safeLimit,
    );
    if (viaProxy.status === "ok") {
      return viaProxy.posts;
    }
    console.warn(
      `[reddit] ScraperAPI falló para r/${sub}; reintentando por fetch directo.`,
    );
  }

  // Fallback (or primary when no key): direct fetch to Reddit with a real
  // browser User-Agent. Reddit may 429/403 datacenter IPs, but it's a free,
  // cheap resilience net when the premium pool fails or times out.
  const direct = await fetchSubredditFeedOnce(
    rssUrl,
    REDDIT_HEADERS,
    FETCH_TIMEOUT_MS,
    false,
    safeLimit,
  );
  return direct.posts;
}

/**
 * Attempts one strategy (ScraperAPI or direct) for a subreddit feed and returns
 * the parsed posts, or `{ status: "ok"|"fail" }`. The retry policy and
 * ScraperAPI->direct handoff live in the caller (`fetchSubredditFeed`).
 */
async function fetchSubredditFeedOnce(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  viaProxy: boolean,
  safeLimit: number,
): Promise<{ status: "ok" | "fail"; posts: RedditPost[] }> {
  let fetchUrl = targetUrl;
  if (viaProxy) {
    fetchUrl = toScraperApiUrl(targetUrl);
  }

  let response: Response;
  try {
    // Retries rate-limits (429/403/503) and timeouts internally; network
    // errors timeouts are retried, then thrown so we can fall back.
    response = await fetchWithRetry(() =>
      fetchWithTimeout(fetchUrl, headers, timeoutMs),
    );
  } catch (error) {
    console.warn(
      `[reddit] ${viaProxy ? "ScraperAPI" : "Fetch directo"} sin éxito para r/${extractSubFromUrl(targetUrl)} tras reintentos:`,
      error,
    );
    return { status: "fail", posts: [] };
  }

  // 1. Validate HTTP status: treat any non-OK response (404, 403, 429, 5xx…)
  // as a per-subreddit failure — log it and skip without aborting the pipeline.
  if (!response.ok) {
    console.warn(
      `[reddit] r/${extractSubFromUrl(targetUrl)} respondió ${response.status} via ${viaProxy ? "ScraperAPI" : "directo"}; se omite el subreddit.`,
    );
    return { status: "fail", posts: [] };
  }

  const xmlRaw = await response.text();
  if (!xmlRaw.trim()) {
    console.warn(`[reddit] Feed vacío para el subreddit.`);
    return { status: "fail", posts: [] };
  }

  // 2. Detect HTML responses: a 200/206 with an HTML body means Reddit
  // returned a block/CAPTCHA/error page instead of RSS. Bail out gracefully.
  if (isHtmlResponse(xmlRaw)) {
    console.warn(
      `[reddit] El subreddit devolvió una página HTML (bloqueo/CAPTCHA) via ${viaProxy ? "ScraperAPI" : "directo"}; se omite.`,
    );
    return { status: "fail", posts: [] };
  }

  // 3. Sanitize the XML before parsing: strip invalid XML control characters,
  // escape loose ampersands, and drop corrupt tags to avoid "Invalid character
  // in tag name" / "Invalid character in entity name" errors.
  const cleanXml = sanitizeXml(xmlRaw);

  let feed: { items?: RedditRssItem[] };
  try {
    feed = await rssParser.parseString(cleanXml);
  } catch (error) {
    console.error(`[reddit] No se pudo parsear el RSS:`, error);
    return { status: "fail", posts: [] };
  }

  // Guard against a parsed-but-empty feed (e.g. malformed RSS).
  if (!Array.isArray(feed.items) || feed.items.length === 0) {
    console.warn(`[reddit] Feed sin items.`);
    return { status: "fail", posts: [] };
  }

  const sub = extractSubFromUrl(targetUrl);
  return { status: "ok", posts: mapRssItemsToPosts(feed.items, sub).slice(0, safeLimit) };
}

/** Pulls the subreddit name out of a `.../r/{sub}/new.rss` URL for logging. */
function extractSubFromUrl(url: string): string {
  const matches = /\/r\/([^/]+)\//.exec(url);
  return matches?.[1] ?? "?";
}

/**
 * Heuristically detects whether a fetched body is an HTML error/block page
 * rather than an RSS/Atom feed. An HTML block indicates Reddit responded with
 * a CAPTCHA or rate-limit page instead of the feed.
 */
function isHtmlResponse(body: string): boolean {
  const head = body.slice(0, 1000).toLowerCase();
  return head.includes("<!doctype html") || /<html[\s>]/.test(head);
}

/**
 * Makes a malformed feed safe to parse. With Reddit's RSS (possibly proxied by
 * ScraperAPI) we often see:
 *   - Invalid XML control characters (breaks tag names).
 *   - Loose/bare `&` where an entity was expected ("Invalid character in
 *     entity name").
 *
 * @returns A cleaned string ready for `rssParser.parseString`.
 */
function sanitizeXml(xml: string): string {
  return (
    xml
      // Remove XML-invalid control characters (keeps \t, \n, \r).
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Escape bare ampersands that aren't a valid named/numeric entity,
      // and keep known entities intact.
      .replace(
        /&(?!(?:(?:amp|lt|gt|quot|apos|nbsp);)|#\d+;|#x[0-9a-fA-F]+;)/g,
        "&amp;",
      )
      // Newline/whitespace-only "tags" that aren't real elements.
      .replace(/<\s+>/g, " ")
  );
}

/**
 * Routes a target URL through ScraperAPI when `SCRAPER_API_KEY` is configured.
 *
 * Anti-block strategy so Reddit delivers the raw RSS XML instead of an HTML
 * block/CAPTCHA page:
 *   - `premium=true` routes through ScraperAPI's residentially-IP'd premium
 *     pool, which sidesteps the datacenter-IP 429/403 blocks.
 *   - `render` is intentionally NOT set: `render=true` forces a headless
 *     browser to execute JS and returns the rendered HTML *site*, which would
 *     turn an `.rss` response into an HTML page (why the fetcher kept seeing
 *     "página HTML / bloqueo"). For a raw XML feed we want the un-rendered
 *     body.
 *
 * The target URL is passed cleanly (single-encoded) via `URLSearchParams`.
 *
 * @param targetUrl The original URL to scrape (e.g. a Reddit RSS feed).
 * @returns         The ScraperAPI proxy URL, or the original URL unchanged when
 *                  no API key is present in the environment.
 */
function toScraperApiUrl(targetUrl: string): string {
  const apiKey = process.env.SCRAPER_API_KEY?.trim();
  if (!apiKey) return targetUrl;

  const params = new URLSearchParams({
    api_key: apiKey,
    url: targetUrl,
    // Residential proxy pool to dodge datacenter-IP blocks. render left off:
    // it would return the rendered HTML page instead of the raw RSS XML.
    premium: "true",
  });
  return `http://api.scraperapi.com?${params.toString()}`;
}

/**
 * Result of a single networked attempt. A `Response` on HTTP completion
 * (including non-2xx), or a thrown error (network failure/timeout). We surface
 * timeouts explicitly so the caller can decide whether to retry.
 */
type FetchAttempt =
  | { kind: "response"; response: Response }
  | { kind: "error"; error: unknown; aborted: boolean };

/**
 * Fetches a URL once, honoring the politeness throttle and per-attempt timeout.
 * Timeouts abort via `AbortController`; the resulting abort is reported as an
 * `aborted` error (instead of a synthetic 500) so the retry loop can retry it.
 *
 * @param timeoutMs Per-attempt timeout; ScraperAPI calls pass a larger value
 *                  (30s) than direct Reddit fetches to avoid premature aborts.
 */
async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FetchAttempt> {
  await throttleNextRequest();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
      // Default to fresh data; feeds are fetched per scan.
      cache: "no-store",
    });
    return { kind: "response", response };
  } catch (error) {
    // Never log the full URL: ScraperAPI puts `api_key` on the query string and
    // would leak the credential. `redactUrl` masks query values.
    console.error(`[reddit] Error de red en ${redactUrl(url)}:`, error);
    return {
      kind: "error",
      error,
      // An aborted request is a timeout (the signal fires after timeoutMs).
      // Network errors from undici surface as `AbortError` too.
      aborted: isTimeoutError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Retries a request with exponential backoff on transient/retryable failures:
 * rate-limited responses (429/403/503) and timeouts/network aborts. Non-transient
 * responses (e.g. 404, 500) and other network errors are returned/re-thrown so
 * the caller can decide (or fall back to a direct fetch).
 *
 * @param request A thunk performing ONE attempt (e.g. `fetchWithTimeout`). Each
 *                call re-throttles via `throttleNextRequest`.
 */
async function fetchWithRetry(
  request: () => Promise<FetchAttempt>,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const outcome = await request();

    let retryable: boolean;
    let status: number | null = null;
    let timeout: boolean = false;

    if (outcome.kind === "response") {
      status = outcome.response.status;
      retryable = RETRYABLE_STATUS.has(status);
    } else {
      timeout = outcome.aborted;
      retryable = timeout;
    }

    if (retryable && attempt < MAX_RETRIES) {
      // Timeouts need longer to back off than rate limits: premium ScraperAPI
      // can take 10-20s+ to respond, so give it room before giving up.
      const baseBackoff = timeout ? BACKOFF_BASE_MS * 3 : BACKOFF_BASE_MS;
      const backoff = baseBackoff * Math.pow(2, attempt);
      // Jitter up to 500ms to avoid synchronized retry bursts across subreddits.
      const wait = backoff + randBetween(0, 500);
      const reason = timeout ? "timeout/abort" : `status ${status}`;
      console.warn(
        `[reddit] ${reason}; reintentando en ${wait}ms (intento ${attempt + 1}/${MAX_RETRIES}).`,
      );
      await sleep(wait);
      attempt++;
      continue;
    }

    // Give up: surface the timeout/network error so callers can run their
    // fallback path (e.g. direct Reddit fetch) instead of silently returning
    // a 500 that the pipeline would treat as a failed subreddit.
    if (outcome.kind === "error") {
      throw outcome.error;
    }
    return outcome.response;
  }
}

/**
 * Maps RSS feed items into normalized `RedditPost`s.
 *
 * The Reddit post id is extracted from the item's `link`
 * (`/r/{sub}/comments/{POST_ID}/{slug}/`) because RSS feeds do not carry the
 * numeric id directly. Keeps only items with a resolvable id and title.
 */
function mapRssItemsToPosts(
  items: RedditRssItem[],
  subreddit: string,
): RedditPost[] {
  const posts: RedditPost[] = [];

  for (const item of items) {
    if (!item) continue;

    const title = cleanText(item.title);
    if (!title) continue;

    const link = typeof item.link === "string" ? item.link.trim() : "";
    if (!link) continue;

    const redditPostId = extractPostId(link);
    if (!redditPostId) continue;

    const author = parseAuthor(item.creator ?? item.author);
    const content = extractPostContent(item);

    posts.push({
      reddit_post_id: redditPostId,
      title,
      content,
      author,
      post_url: link.startsWith("http") ? link : `https://www.reddit.com${link}`,
      subreddit,
    });
  }

  return posts;
}

/**
 * Extracts the post's base-36 id from a Reddit post URL, e.g.
 * `https://www.reddit.com/r/marketing/comments/abc123/slug/` -> `abc123`.
 */
function extractPostId(link: string): string | null {
  const matches = /\/comments\/([a-z0-9]+)\//i.exec(link);
  return matches?.[1] ?? null;
}

/** Cleans, trims, and collapses whitespace in a title. */
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Resolves the content/selftext of an RSS item.
 *
 * Prefers the snippet (plain text) but falls back to the encoded content,
 * stripping Reddit's `<!-- SC_OFF -->` / `<!-- SC_ON -->` markers.
 */
function extractPostContent(item: RedditRssItem): string | null {
  const snippet = typeof item.contentSnippet === "string"
    ? item.contentSnippet.trim()
    : "";
  if (snippet) return snippet;

  const raw = item["content:encoded"];
  const encoded = typeof raw === "string" && raw.length > 0 ? raw : "";
  if (!encoded) return null;

  return cleanText(
    encoded
      .replace(/<!--\s*SC_OFF\s*-->/gi, "")
      .replace(/<!--\s*SC_ON\s*-->/gi, ""),
  ) || null;
}

/** Normalizes the author (author may arrive as `u/name` or plain name). */
function parseAuthor(value: unknown): string | null {
  const author = typeof value === "string" ? value.trim() : "";
  if (!author) return null;
  return author.startsWith("u/") ? author.slice(2) : author;
}

/**
 * Normalizes a subreddit reference into a bare, URL-safe name:
 * trims whitespace, strips a leading `r/` and its trailing-space artifacts, and
 * collapses any internal spaces. Returns `""` when the result is blank.
 */
function normalizeSubname(subreddit: string): string {
  return subreddit
    .trim()
    .replace(/^r\/+/i, "")
    .replace(/\s+/g, "")
    .replace(/\/+$/g, "");
}

/**
 * Whether an error is a timeout/abort (as opposed to, say, a DNS/TLS failure).
 * Undici surfaces timed-out fetches as a `DOMException` named `AbortError`.
 */
function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (typeof (error as { cause?: unknown }).cause === "object" &&
        ((error as { cause?: { name?: string } }).cause?.name ??
          "") === "AbortError"))
  );
}

/**
 * Parses a numeric timeout from an environment value, falling back to
 * `fallback` when unset/invalid. Dedicated helper so a misconfigured env value
 * never yields `NaN`/`Infinity` that would break `setTimeout`.
 */
function parseTimeoutEnv(raw: string | undefined, fallback: number): number {
  const value = raw?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Resolves after a randomized delay between `min` and `max` ms. */
function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Redacts secrets from a URL for safe logging.
 *
 * ScraperAPI URLs carry the credential in the `api_key` query param, and any
 * query string may hold opaque/per-site tokens, so replace query values with a
 * placeholder while keeping it obvious which target was being requested.
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.size > 0) {
      for (const key of parsed.searchParams.keys()) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return parsed.toString();
  } catch {
    // Not a valid URL (rare) — return a truncated string rather than the raw
    // text in case it carries sensitive data.
    return url.length > 80
      ? `${url.slice(0, 40)}…${url.slice(-32)}`
      : url;
  }
}

// ---------------------------------------------------------------------------
// RSS item structural types (mapped from Reddit's `new.rss` feed)
// ---------------------------------------------------------------------------

type RedditRssItem = {
  title?: string;
  link?: string;
  author?: string;
  creator?: string;
  pubDate?: string;
  guid?: string;
  content?: string;
  contentSnippet?: string;
  "content:encoded"?: unknown;
};
