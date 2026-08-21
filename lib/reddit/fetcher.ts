/**
 * Reddit ingestion helpers.
 *
 * Fetches posts from a subreddit via Reddit's public RSS feeds (`new.rss`)
 * instead of the JSON API, which requires a registered bot in Reddit's
 * Developer Portal. Requests route through ScraperAPI (when a
 * `SCRAPER_API_KEY` is set) to bypass IP-level 429/403 blocks, else are made
 * directly and normalized via `rss-parser` into the typed shape the lead
 * pipeline (and Gemini) consume.
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
 * to rotate IPs and warm up before responding (30s to avoid premature aborts).
 */
const FETCH_TIMEOUT_MS_SCRAPER_API = 30000;

/** Rate-limit statuses we treat as retryable via exponential backoff. */
const RETRYABLE_STATUS = new Set([429, 403, 503]);

/** Max retries for rate-limited/transient requests (besides the first call). */
const MAX_RETRIES = 3;

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
 * Uses `old.reddit.com/r/{sub}/new.rss` (no Developer Portal registration
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

  // Normalize to a bare sub name; default to a known-active community.
  const sub =
    subreddit.trim().replace(/^r\//, "") || DEFAULT_SUBREDDITS[0] || "TiviMate";

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
 */
async function fetchSubredditFeed(sub: string, safeLimit: number): Promise<RedditPost[]> {
  // Reddit serves RSS at the `/new/.rss` endpoint; keep the trailing `.rss`
  // so ScraperAPI requests the feed and not the HTML site.
  const rssUrl = `https://www.reddit.com/r/${encodeURIComponent(
    sub,
  )}/new/.rss`;

  // Route through ScraperAPI when a key is configured to avoid Reddit's
  // IP-level 429/403 blocks; otherwise fetch the RSS directly.
  const fetchUrl = toScraperApiUrl(rssUrl);
  const viaProxy = usesScraperApi(fetchUrl);
  const headers = viaProxy ? SCRAPER_API_HEADERS : REDDIT_HEADERS;
  const timeoutMs = viaProxy ? FETCH_TIMEOUT_MS_SCRAPER_API : FETCH_TIMEOUT_MS;

  const response = await fetchWithRetry(() =>
    fetchWithTimeout(fetchUrl, headers, timeoutMs),
  );

  // 1. Validate HTTP status: treat any non-OK response (404, 403, 429, 5xx…)
  // as a per-subreddit failure — log it and skip without aborting the pipeline.
  if (!response.ok) {
    console.warn(
      `[reddit] r/${sub} respondió ${response.status}; se omite el subreddit.`,
    );
    return [];
  }

  const xmlRaw = await response.text();
  if (!xmlRaw.trim()) {
    console.warn(`[reddit] Feed vacío para r/${sub}.`);
    return [];
  }

  // 2. Detect HTML responses: a 200/206 with an HTML body means Reddit
  // returned a block/CAPTCHA/error page instead of RSS. Bail out gracefully.
  if (isHtmlResponse(xmlRaw)) {
    console.warn(
      `[reddit] r/${sub} devolvió una página HTML (bloqueo/CAPTCHA); se omite.`,
    );
    return [];
  }

  // 3. Sanitize the XML before parsing: strip invalid XML control characters,
  // escape loose ampersands, and drop corrupt tags to avoid "Invalid character
  // in tag name" / "Invalid character in entity name" errors.
  const cleanXml = sanitizeXml(xmlRaw);

  let feed: { items?: RedditRssItem[] };
  try {
    feed = await rssParser.parseString(cleanXml);
  } catch (error) {
    console.error(`[reddit] No se pudo parsear el RSS de r/${sub}:`, error);
    return [];
  }

  // Guard against a parsed-but-empty feed (e.g. malformed RSS).
  if (!Array.isArray(feed.items) || feed.items.length === 0) {
    console.warn(`[reddit] Feed sin items para r/${sub}.`);
    return [];
  }

  return mapRssItemsToPosts(feed.items, sub).slice(0, safeLimit);
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
 * Adds anti-block evasion flags so Reddit doesn't deliver an HTML block page:
 * `premium=true` uses residential/proxy pool and `render=true` forces a
 * browser-rendered response. The target URL is passed cleanly (single-encoded)
 * via `URLSearchParams`.
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
    // Evade datacenter-IP blocking: premium residential pool + rendered page.
    premium: "true",
    render: "true",
  });
  return `http://api.scraperapi.com?${params.toString()}`;
}

/**
 * Whether a URL points at ScraperAPI (as opposed to a direct Reddit feed).
 */
function usesScraperApi(url: string): boolean {
  return url.startsWith("http://api.scraperapi.com");
}

/**
 * Fetches a URL once, honoring the politeness throttle and per-attempt timeout.
 * Rate-limit/transient responses are handled by the outer retry loop.
 *
 * @param timeoutMs Per-attempt timeout; ScraperAPI calls pass a larger value
 *                  (30s) than direct Reddit fetches to avoid premature aborts.
 */
async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  await throttleNextRequest();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
      // Jitter up to 500ms to avoid synchronized retry bursts across subreddits.
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

/** Resolves after a randomized delay between `min` and `max` ms. */
function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
