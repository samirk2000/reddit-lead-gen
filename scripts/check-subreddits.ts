/**
 * Diagnostic tool: checks the availability of candidate target subreddits by
 * hitting Reddit's lightweight public endpoints.
 *
 * It runs DIRECT, lightweight fetches (NO ScraperAPI credits), so it's safe to
 * run repeatedly. Use it to decide which subreddits to enable in
 * `DEFAULT_SUBREDDITS` (lib/reddit/fetcher.ts) before locking in the pipeline.
 *
 * IMPORTANT about results:
 *   - A 404 is conclusive: the sub does not exist.
 *   - A 403/429/network-error means Reddit blocked this IP for the endpoint
 *     (datacenter IP), NOT that the subreddit is invalid. We label it
 *     INDETERMINADO and retry the RSS endpoint as a fallback probe.
 *   - 200 signals ACTIVO.
 *
 * Run from the project root:
 *   node --experimental-strip-types scripts/check-subreddits.ts
 *
 * Optionally pass a space-separated list to override the defaults:
 *   node ... scripts/check-subreddits.ts TiviMate androidtv
 */
const DEFAULT_CANDIDATES = [
  "firetvstick",
  "smartersiptv",
  "TiviMate",
  "AndroidTV",
  "cordcutters",
  "Stremio",
  "sideloaded",
  "iptv",
] as const;

// Browser-like User-Agent so Reddit doesn't treat this as a bare datacenter bot.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const candidates = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [...DEFAULT_CANDIDATES];

const TIMEOUT_MS = 10_000;

const summary = { active: 0, notFound: 0, indeterminate: 0 };

console.log("\n=== Check: disponibilidad de subreddits ===");
console.log(`Candidatos: ${candidates.join(", ")}\n`);

for (const raw of candidates) {
  const sub = normalizeSub(raw);

  // Primary probe: public JSON endpoint.
  const jsonUrl = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=1`;
  let probe = await check(jsonUrl);

  // If IP-blocked (403/429/ERR), retry the RSS endpoint which Reddit blocks
  // less aggressively, to help distinguish "blocked" from "does not exist".
  if (probe.kind === "indeterminate") {
    const rssUrl = `https://old.reddit.com/r/${encodeURIComponent(sub)}/.rss`;
    const rssProbe = await check(rssUrl);
    if (rssProbe.kind === "active") {
      probe = rssProbe; // RSS responded => sub is alive, JSON was just blocked.
    }
  }

  switch (probe.kind) {
    case "active":
      summary.active++;
      console.log(`[ACTIVO] r/${sub} (status ${probe.status})`);
      break;
    case "notFound":
      summary.notFound++;
      console.log(`[INVALIDO/404] r/${sub} — subreddit no existe`);
      break;
    case "indeterminate":
    default:
      summary.indeterminate++;
      console.log(
        `[INDETERMINADO] r/${sub} (${probe.status})${
          probe.message ? ` — ${probe.message}` : ""
        }: bloqueo de IP, no se pudo confirmar disponibilidad`,
      );
      break;
  }

  await delay(500);
}

console.log("\n=== Resultado ===");
console.log(
  `Activos: ${summary.active} | 404/inexistentes: ${summary.notFound} | indeterminados (bloqueo IP): ${summary.indeterminate} (de ${candidates.length})`,
);
console.log("----------------------------------------\n");
process.exit(summary.notFound > 0 ? 2 : 0);

/** Normalizes a subreddit reference (trim, strip `r/`, collapse spaces). */
function normalizeSub(value: string): string {
  const clean = value.trim().replace(/^r\/+/i, "").replace(/\s+/g, "");
  return clean.replace(/\/+$/g, "") || "all";
}

type Probe =
  | { kind: "active"; status: string }
  | { kind: "notFound"; status: string }
  | { kind: "indeterminate"; status: string; message?: string };

/** Performs ONE lightweight check against an endpoint (JSON or RSS). */
async function check(url: string): Promise<Probe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/xml, text/xml, */*;q=0.8" },
      cache: "no-store",
    });

    if (res.ok) return { kind: "active", status: String(res.status) };
    if (res.status === 404) return { kind: "notFound", status: "404" };
    // Anything else (403, 429, 5xx) is likely IP/rate blocking, not a missing sub.
    return { kind: "indeterminate", status: String(res.status) };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "error de red";
    return { kind: "indeterminate", status: "ERR", message };
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Marks this file as a module so top-level `await` is valid TS (harmless at
// runtime with `--experimental-strip-types`: no value is actually exported).
export {};

