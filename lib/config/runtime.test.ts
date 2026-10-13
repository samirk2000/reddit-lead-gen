import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cloudScraperEnabled,
  DEFAULT_GEMINI_MODEL,
  geminiModel,
  telegramAlertMinScore,
} from "./runtime";

const KEYS = ["GEMINI_MODEL", "TELEGRAM_ALERT_MIN_SCORE", "CLOUD_SCRAPER_ENABLED"] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("runtime config", () => {
  it("usa gemini-3.6-flash si no hay env", () => {
    delete process.env.GEMINI_MODEL;
    assert.equal(geminiModel(), DEFAULT_GEMINI_MODEL);
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.6-flash");
  });

  it("respeta GEMINI_MODEL y el umbral de Telegram", () => {
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    process.env.TELEGRAM_ALERT_MIN_SCORE = "8";
    assert.equal(geminiModel(), "gemini-3.8-flash");
    assert.equal(telegramAlertMinScore(), 8);
  });

  it("ignora umbrales inválidos y deja el scraper de la nube apagado", () => {
    process.env.TELEGRAM_ALERT_MIN_SCORE = "11";
    assert.equal(telegramAlertMinScore(), 7);
    assert.equal(cloudScraperEnabled(), false);
    process.env.CLOUD_SCRAPER_ENABLED = "true";
    assert.equal(cloudScraperEnabled(), true);
  });
});
