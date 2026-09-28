/** HTTPS Reddit post URL safe to render as a link. */
export function redditPostHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "reddit.com" ||
      host.endsWith(".reddit.com") ||
      host === "redd.it";
    if (!allowed) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isRedditPostUrl(value: string): boolean {
  return redditPostHref(value) !== null;
}

/** Subreddit rules page, so the operator can check self-promotion limits. */
export function subredditRulesHref(subreddit: string): string | null {
  if (!/^[A-Za-z0-9_]{2,50}$/.test(subreddit)) return null;
  return `https://www.reddit.com/r/${subreddit}/about/rules`;
}
