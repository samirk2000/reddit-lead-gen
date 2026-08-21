/**
 * Smoke test for the Reddit fetcher layer (lib/reddit/fetcher.ts).
 *
 * Purpose (Pending Step #1): validate against the REAL ScraperAPI + Reddit that:
 *   1. Default subreddits return parseable RSS XML (or are correctly detected
 *      as HTML-blocked / empty instead of throwing).
 *   2. The 5-minute in-memory feed cache is hit (no second ScraperAPI call)
 *      when a subreddit is re-requested within the TTL.
 *   3. We can observe the actual credit/network behavior per subreddit.
 *
 * Run from the project root:
 *   node --experimental-strip-types --env-file=.env.local scripts/smoke-fetcher.ts
 *
 * Optionally pass a space-separated list of subreddits to override the
 * defaults:
 *   node ... scripts/smoke-fetcher.ts TiviMate androidtv cordcutters
 */
import { fetchSubredditPosts, DEFAULT_SUBREDDITS } from "../lib/reddit/fetcher.ts";

const OK = "OK";
const WARN = "!";
const CACHE = "CACHED";
const EMPTY = "-";

const subreddits =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [...DEFAULT_SUBREDDITS];

console.log("\n=== Smoke: Reddit fetcher (ScraperAPI) ===");
console.log(`Subreddits a probar: ${subreddits.join(", ")}`);
console.log(
  `Modo: ${process.env.SCRAPER_API_KEY ? "via ScraperAPI (premium, sin render)" : "fetch directo (sin key)"}\n`,
);

const summary = { subreddits: 0, ok: 0, empty: 0, failed: 0, postsSeen: 0 };
const startAll = Date.now();

for (const sub of subreddits) {
  summary.subreddits++;
  const t0 = Date.now();
  const first = await run(() => fetchSubredditPosts(sub, 25));
  const elapsed = Date.now() - t0;

  if (first.status === "error") {
    summary.failed++;
    console.log(
      `[${WARN}] r/${sub}: ERROR -> ${first.error.message} (${elapsed}ms)`,
    );
    continue;
  }

  const posts = first.posts;
  if (posts.length === 0) {
    summary.empty++;
    console.log(
      `[${EMPTY}] r/${sub}: feed vacío / HTML bloqueado, sin items (${elapsed}ms)`,
    );
  } else {
    summary.ok++;
    summary.postsSeen += posts.length;
    const sample = posts[0]?.title ?? "(sin título)";
    console.log(
      `[${OK}] r/${sub}: ${posts.length} posts parseados (${elapsed}ms) | e.g. "${sample.slice(0, 48)}"`,
    );
  }

  // Re-request the SAME subreddit immediately to prove the 5-min cache. A hit
  // returns instantly with the same result and spawns NO new ScraperAPI call.
  const t1 = Date.now();
  const second = await run(() => fetchSubredditPosts(sub, 25));
  const cacheElapsed = Date.now() - t1;
  const sameLen = second.posts.length === posts.length;
  if (cacheElapsed < 200) {
    console.log(
      `  [${CACHE}] re-fetch r/${sub} en ${cacheElapsed}ms, misma longitud=${sameLen} -> CACHE HIT (sin gastar crédito)`,
    );
  } else {
    console.log(
      `  [${WARN}] re-fetch r/${sub} en ${cacheElapsed}ms (lento: puede ser fetch real, revisar TTL)`,
    );
  }

  await delay(250);
}

const total = Date.now() - startAll;
console.log("\n=== Resultado (" + Math.round(total / 1000) + "s) ===");
console.log(
  `Subreddits: ${summary.subreddits} | con posts: ${summary.ok} | sin items: ${summary.empty} | errores: ${summary.failed}`,
);
console.log(`Posts únicos totales vistos: ${summary.postsSeen}`);
console.log("----------------------------------------\n");

process.exit(summary.failed > 0 ? 1 : 0);

type Outcome = { status: "ok"; posts: Awaited<ReturnType<typeof fetchSubredditPosts>>; error: null } | { status: "error"; posts: never[]; error: Error };

async function run(fn: () => Promise<Awaited<ReturnType<typeof fetchSubredditPosts>>>): Promise<Outcome> {
  try {
    const posts = await fn();
    return { status: "ok", posts, error: null };
  } catch (error) {
    return {
      status: "error",
      posts: [],
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
