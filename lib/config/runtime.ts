/**
 * Server runtime knobs. Read at call time so Vercel env changes apply on the
 * next cold start without baking a stale model id into a constant.
 */

/** Stable Gemini Flash id that the API still serves. Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/** Default Telegram cutoff. Scores are Gemini's 1–10 intent scale. */
export const DEFAULT_TELEGRAM_ALERT_MIN_SCORE = 7;

export function geminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || DEFAULT_GEMINI_MODEL;
}

/**
 * Minimum Gemini intent score that triggers a Telegram alert.
 * Invalid values fall back to 7 and are logged.
 */
export function telegramAlertMinScore(): number {
  const raw = process.env.TELEGRAM_ALERT_MIN_SCORE?.trim();
  if (!raw) return DEFAULT_TELEGRAM_ALERT_MIN_SCORE;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    console.error("[config] TELEGRAM_ALERT_MIN_SCORE inválido, se usa 7", {
      raw,
    });
    return DEFAULT_TELEGRAM_ALERT_MIN_SCORE;
  }
  return parsed;
}

/**
 * Cloud Reddit/Quora scan from Vercel. Off unless explicitly enabled.
 * The Windows app is the primary source; this flag is the optional fallback.
 */
export function cloudScraperEnabled(): boolean {
  const raw = (process.env.CLOUD_SCRAPER_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
