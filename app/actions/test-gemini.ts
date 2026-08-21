"use server";

import { analyzeRedditPost, type RedditPostAnalysis } from "@/lib/ai/gemini";

/** Payload returned to the client for logging/inspection. */
export type TestGeminiResult = {
  ok: boolean;
  data: RedditPostAnalysis | null;
  error: string | null;
};

/**
 * Standalone test harness for `analyzeRedditPost`.
 *
 * Runs a fixed, dummy Reddit post through the Gemini analysis pipeline and
 * returns the structured result (or the failure reason) so it can be logged
 * during development. Uses the shared `GEMINI_API_KEY` unless a per-user key
 * is passed.
 */
export async function testGemini(
  userApiKey?: string,
): Promise<TestGeminiResult> {
  const dummyTitle = "Mi equipo dedica horas a buscar leads en Reddit";
  const dummyContent =
    "Estamos gastando demasiado tiempo identificando hilos relevantes y " +
    "respondiendo manualmente. ¿Alguien conoce una forma mejor de detectar " +
    "oportunidades de venta según ciertas keywords?";
  const keyword = "automatizar prospección en Reddit";

  try {
    const analysis = await analyzeRedditPost(
      dummyTitle,
      dummyContent,
      keyword,
      userApiKey,
    );

    // Structured log so the entry is greppable in dev output.
    console.log("[test-gemini] OK", {
      keyword,
      intent_score: analysis.intent_score,
      analysis_reasoning: analysis.analysis_reasoning,
      suggested_reply: analysis.suggested_reply,
    });

    return { ok: true, data: analysis, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("[test-gemini] FAILED", { keyword, error: message });

    return { ok: false, data: null, error: message };
  }
}
