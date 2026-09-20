/**
 * Channel helpers for Reddit vs Quora leads.
 */

export type LeadChannel = "reddit" | "quora";

export function detectLeadChannel(input: {
  subreddit?: string | null;
  post_url?: string | null;
  title?: string | null;
}): LeadChannel {
  const sub = (input.subreddit || "").toLowerCase();
  const url = (input.post_url || "").toLowerCase();
  const title = (input.title || "").toLowerCase();
  if (
    sub.includes("quora") ||
    url.includes("quora.com") ||
    title.startsWith("[quora]")
  ) {
    return "quora";
  }
  return "reddit";
}

export function channelLabel(channel: LeadChannel): string {
  return channel === "quora" ? "Quora" : "Reddit";
}
