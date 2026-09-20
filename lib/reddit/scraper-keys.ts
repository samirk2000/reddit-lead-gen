/**
 * ScraperAPI key pool with runtime fallback.
 *
 * Configure any of:
 *   - `SCRAPER_API_KEYS=key1,key2,key3`  (preferred)
 *   - `SCRAPER_API_KEY` + optional `SCRAPER_API_KEY_2` / `SCRAPER_API_KEY_3`
 *
 * When a key returns credit/auth failure it is marked dead for this process
 * lifetime and the next key is tried. Direct Reddit fetch remains the first
 * strategy; this pool only applies when the proxy is needed.
 */

const deadKeys = new Set<string>();

/** Collects unique live keys from env (order preserved). */
export function listScraperApiKeys(): string[] {
  const raw: string[] = [];

  const csv = process.env.SCRAPER_API_KEYS?.trim();
  if (csv) {
    raw.push(...csv.split(/[,;\s]+/).map((k) => k.trim()).filter(Boolean));
  }

  for (const name of [
    "SCRAPER_API_KEY",
    "SCRAPER_API_KEY_2",
    "SCRAPER_API_KEY_3",
    "SCRAPER_API_KEY_4",
  ] as const) {
    const value = process.env[name]?.trim();
    if (value) raw.push(value);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const key of raw) {
    if (seen.has(key) || deadKeys.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

export function scraperApiEnabled(): boolean {
  if (process.env.SCRAPER_API_ENABLED?.trim() === "false") return false;
  return listScraperApiKeys().length > 0;
}

export function toScraperApiUrl(targetUrl: string, apiKey: string): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    url: targetUrl,
  });
  if (process.env.SCRAPER_API_PREMIUM?.trim() === "true") {
    params.set("premium", "true");
  }
  return `http://api.scraperapi.com?${params.toString()}`;
}

/**
 * Marks a key unusable for the rest of this serverless instance lifetime.
 * Logs only a fingerprint (never the full key).
 */
export function markScraperKeyDead(apiKey: string, reason: string): void {
  if (deadKeys.has(apiKey)) return;
  deadKeys.add(apiKey);
  console.warn(
    `[scraper] Key …${apiKey.slice(-6)} descartada: ${reason}. Quedan ${listScraperApiKeys().length} keys vivas.`,
  );
}

/**
 * Whether an HTTP response means "this key is burned / invalid" and we should
 * rotate — as opposed to a Reddit-side block that another key might also hit.
 */
export function isScraperKeyFailure(status: number, bodySnippet: string): boolean {
  if (status === 401 || status === 402) return true;
  // ScraperAPI often uses 403 for out-of-credits / ban on the key.
  if (status === 403) {
    return /credit|quota|limit|unauthorized|invalid|expired|payment|plan/i.test(
      bodySnippet,
    );
  }
  if (status === 429) {
    return /credit|quota|limit/i.test(bodySnippet);
  }
  return /out of credits|request limit|you have no more credits/i.test(
    bodySnippet,
  );
}

export function redactKey(apiKey: string): string {
  if (apiKey.length <= 8) return "***";
  return `…${apiKey.slice(-6)}`;
}
