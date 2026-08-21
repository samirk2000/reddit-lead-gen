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

/** Reddit's `Authorization`-free API requires a descriptive User-Agent. */
const REDDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RedditLeadGenBot/1.0";

/**
 * Fetches the latest posts from a subreddit's `new` feed.
 *
 * @param subreddit Subreddit name (e.g. `marketing`, `entrepreneur`).
 * @param limit     Number of posts to fetch (default 25, max 100).
 * @returns         Normalized array of the newest posts.
 */
export async function fetchSubredditPosts(
  subreddit: string,
  limit: number = 25,
): Promise<RedditPost[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const sub = subreddit.trim().replace(/^r\//, "") || "all";
  const url = `https://www.reddit.com/r/${encodeURIComponent(
    sub,
  )}/new.json?limit=${safeLimit}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": REDDIT_USER_AGENT,
      Accept: "application/json",
    },
    // Default to fresh data; the feed is fetched per scan.
    cache: "no-store",
  });

  if (!response.ok) {
    // Reddit often rate-limits anonymous JSON requests; surface the status.
    throw new Error(
      `Reddit API returned ${response.status} for r/${sub}`,
    );
  }

  const payload = (await response.json()) as RedditListingResponse;
  return mapListingToPosts(payload, sub);
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
