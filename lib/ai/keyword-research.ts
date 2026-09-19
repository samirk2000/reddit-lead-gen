import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/ai/gemini";

/**
 * One researched keyword candidate ready to activate in the pipeline.
 */
export type KeywordCandidate = {
  phrase: string;
  /** 1-10 buying / help-seeking intent for the IPTV niche. */
  intent_score: number;
  /** Why this phrase surfaces hot buyers. */
  rationale: string;
  /** Suggested subreddit target, or `all` for the niche list. */
  suggested_subreddit: string;
  /** rising | stable | seasonal — from model (refined by Trends when available). */
  trend: "rising" | "stable" | "seasonal";
};

export type KeywordResearchResult = {
  niche: string;
  candidates: KeywordCandidate[];
  /** True when SerpAPI Google Trends enriched the result. */
  trendsEnriched: boolean;
  /** Human-readable notes (e.g. Trends skipped / partial). */
  notes: string[];
};

const KEYWORD_RESEARCH_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    "Lista priorizada de frases de alta intención para lead gen en Reddit (nicho IPTV / Fire Stick / players).",
  properties: {
    niche: {
      type: Type.STRING,
      description: "Nicho normalizado que se investigó.",
    },
    candidates: {
      type: Type.ARRAY,
      description: "Hasta 25 frases ordenadas de mayor a menor intención de compra.",
      items: {
        type: Type.OBJECT,
        properties: {
          phrase: {
            type: Type.STRING,
            description:
              "Frase de 2-5 palabras que un comprador escribiría en Reddit/Google/Quora.",
          },
          intent_score: {
            type: Type.INTEGER,
            minimum: 1,
            maximum: 10,
            description: "Intención de compra / búsqueda activa (10 = máxima).",
          },
          rationale: {
            type: Type.STRING,
            description: "Por qué esta frase captura leads calientes (1 frase).",
          },
          suggested_subreddit: {
            type: Type.STRING,
            description:
              "Subreddit bare name (sin r/) o `all` para escanear la lista objetivo.",
          },
          trend: {
            type: Type.STRING,
            description: "rising | stable | seasonal",
          },
        },
        required: [
          "phrase",
          "intent_score",
          "rationale",
          "suggested_subreddit",
          "trend",
        ],
      },
    },
  },
  required: ["niche", "candidates"],
};

/**
 * Runs AI keyword research for the IPTV / streaming-player niche.
 *
 * Uses Gemini structured JSON. Optionally enrich afterwards with Google Trends
 * related queries (SerpAPI) — see `enrichWithGoogleTrends`.
 *
 * @param nicheSeed        Free-text niche (e.g. "IPTV Fire Stick").
 * @param samplePostTitles Recent Reddit titles from target subs (grounding).
 * @param userApiKey       Optional per-user Gemini key.
 */
export async function researchKeywordsWithGemini(
  nicheSeed: string,
  samplePostTitles: string[],
  userApiKey?: string,
): Promise<Omit<KeywordResearchResult, "trendsEnriched" | "notes">> {
  const apiKey = resolveGeminiKey(userApiKey);
  const niche = nicheSeed.trim() || "IPTV Fire Stick Android TV players";
  const prompt = buildResearchPrompt(niche, samplePostTitles);

  const genAI = new GoogleGenAI({ apiKey });
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(1500 * Math.pow(2, attempt - 1));
    }
    try {
      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: KEYWORD_RESEARCH_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini devolvió respuesta vacía en keyword research.");
      }
      return parseResearch(text, niche);
    } catch (error) {
      lastError = error;
      const status =
        error && typeof error === "object" && "status" in error
          ? (error as { status?: number }).status
          : undefined;
      if (status === 429 && attempt < maxRetries - 1) continue;
      console.error("[gemini] keyword research falló:", error);
      throw error instanceof Error
        ? error
        : new Error(`Keyword research falló: ${String(error)}`);
    }
  }

  throw new Error("Gemini rate limit en keyword research.", {
    cause: lastError,
  });
}

function buildResearchPrompt(niche: string, sampleTitles: string[]): string {
  const samples =
    sampleTitles.length > 0
      ? sampleTitles
          .slice(0, 40)
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")
      : "(sin muestras de Reddit disponibles en este momento)";

  return [
    "Eres un investigador SEO / lead-gen estilo Semrush especializado en",
    "IPTV, Fire Stick, Android TV, TiviMate, Smarters y cord-cutting.",
    "",
    "Tu trabajo: proponer frases de ALTA INTENCIÓN que la gente escribe cuando",
    "está a punto de pedir recomendación o comprar (Reddit, Quora, Google).",
    "",
    "REGLAS:",
    "- Frases de 2 a 5 palabras (compuestas). Evita genéricos de 1 palabra",
    "  (best, setup, app, remote) que generan falsos positivos.",
    "- Mezcla: buying intent, setup pain, comparación, provider hunt.",
    "- suggested_subreddit: uno de firetvstick, smartersiptv, TiviMate,",
    "  AndroidTV, cordcutters, Stremio, sideloaded, iptv, o `all`.",
    "- intent_score 8-10 solo si suena a 'estoy buscando / necesito / recomiendan'.",
    "- Máximo 25 candidates, ordenados por intent_score desc.",
    "- Idioma: inglés (el tráfico del nicho en Reddit es mayoritariamente EN).",
    "",
    `NICHO: ${niche}`,
    "",
    "TÍTULOS REALES RECIENTES DE REDDIT (usa el lenguaje que ves aquí):",
    samples,
  ].join("\n");
}

function parseResearch(
  json: string,
  fallbackNiche: string,
): Omit<KeywordResearchResult, "trendsEnriched" | "notes"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("Gemini devolvió JSON inválido en keyword research.", {
      cause: error,
    });
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    throw new Error("Esquema de keyword research inválido.");
  }

  const candidates: KeywordCandidate[] = [];
  for (const raw of parsed.candidates) {
    if (!isRecord(raw)) continue;
    const phrase =
      typeof raw.phrase === "string" ? raw.phrase.trim().slice(0, 200) : "";
    if (!phrase || phrase.split(/\s+/).length < 2) continue;

    const intent =
      typeof raw.intent_score === "number"
        ? Math.max(1, Math.min(10, Math.round(raw.intent_score)))
        : 5;
    const rationale =
      typeof raw.rationale === "string" ? raw.rationale.trim() : "";
    const suggested =
      typeof raw.suggested_subreddit === "string"
        ? raw.suggested_subreddit.trim().replace(/^r\//i, "") || "all"
        : "all";
    const trendRaw = typeof raw.trend === "string" ? raw.trend : "stable";
    const trend =
      trendRaw === "rising" || trendRaw === "seasonal" ? trendRaw : "stable";

    candidates.push({
      phrase,
      intent_score: intent,
      rationale,
      suggested_subreddit: suggested,
      trend,
    });
  }

  // Dedupe by lowercase phrase, keep highest intent.
  const byPhrase = new Map<string, KeywordCandidate>();
  for (const c of candidates) {
    const key = c.phrase.toLowerCase();
    const prev = byPhrase.get(key);
    if (!prev || c.intent_score > prev.intent_score) {
      byPhrase.set(key, c);
    }
  }

  const deduped = [...byPhrase.values()].sort(
    (a, b) => b.intent_score - a.intent_score,
  );

  return {
    niche:
      typeof parsed.niche === "string" && parsed.niche.trim()
        ? parsed.niche.trim()
        : fallbackNiche,
    candidates: deduped.slice(0, 25),
  };
}

function resolveGeminiKey(userApiKey?: string): string {
  const apiKey = userApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta API key de Gemini (user settings o GEMINI_API_KEY).",
    );
  }
  return apiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
