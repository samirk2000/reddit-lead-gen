import { GoogleGenAI, Type, type Schema } from "@google/genai";

/**
 * Structured output for a single analyzed Reddit post.
 *
 * Mirrors the shape enforced via `responseSchema` so the pipeline can parse
 * and persist results into `detected_leads`.
 */
export type RedditPostAnalysis = {
  /**
   * Purchase intent / pain-point alignment with the keyword. 1 (low) to 10
   * (high). A score below 6 signals the thread is not worth engaging.
   */
  intent_score: number;
  /** Concise (2-sentence) rationale for the assigned score. */
  analysis_reasoning: string;
  /** Peer-style, value-first reply to post on Reddit. */
  suggested_reply: string;
};

/**
 * Response schema enforced by Gemini so the model must return valid JSON that
 * matches `RedditPostAnalysis`. Uses integer bounds on `intent_score` and
 * strict required fields.
 */
export const REDDIT_ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    "Análisis estructurado de un post de Reddit frente a una keyword objetivo.",
  properties: {
    intent_score: {
      type: Type.INTEGER,
      description:
        "Puntuación de intención de compra / dolor inminente de 1 a 10 (10 = máxima alineación con la keyword).",
      minimum: 1,
      maximum: 10,
    },
    analysis_reasoning: {
      type: Type.STRING,
      description:
        "Explicación breve (2 frases) de por qué se asignó esa puntuación.",
    },
    suggested_reply: {
      type: Type.STRING,
      description:
        "Respuesta persuasiva, natural y sin tono de venta para publicar como un par con alto valor, sin parecer bot ni spam promocional.",
    },
  },
  required: ["intent_score", "analysis_reasoning", "suggested_reply"],
};

/** Gemini model used for structured post analysis. */
export const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Analyzes a Reddit post against a target keyword using `gemini-2.5-flash`.
 *
 * API key resolution order:
 *   1. `userApiKey` (per-user key stored in `user_settings.gemini_api_key`)
 *   2. `process.env.GEMINI_API_KEY` (shared/server key)
 *
 * @param postTitle    Reddit post title.
 * @param postContent  Reddit post body (may be empty).
 * @param keyword      The user's target keyword/phrase to match against.
 * @param userApiKey   Optional per-user API key override.
 * @returns            Parsed structured analysis.
 * @throws             When no API key is configured, when the model is
 *                     rate-limited after retries, or when the response cannot
 *                     be parsed.
 */
export async function analyzeRedditPost(
  postTitle: string,
  postContent: string,
  keyword: string,
  userApiKey?: string,
): Promise<RedditPostAnalysis> {
  const apiKey = resolveApiKey(userApiKey);

  const prompt = buildAnalysisPrompt(postTitle, postContent, keyword);

  const genAI = new GoogleGenAI({ apiKey });

  const initialDelayMs = 1500;
  const maxRetries = 3;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(initialDelayMs * Math.pow(2, attempt - 1));
    }

    try {
      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: REDDIT_ANALYSIS_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error(
          "Gemini devolvió una respuesta vacía o sin campo de texto.",
        );
      }

      return parseAndValidate(text);
    } catch (error) {
      const status = getRateLimitStatus(error);
      if (status !== undefined) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          continue; // retry, the loop sleeps before the next attempt
        }
      }
      throw wrapError(error, { postTitle, keyword });
    }
  }

  // Unreachable when a non-rate-limit error throws above; reachable only if
  // every attempt was rate-limited and retries were exhausted.
  throw new Error(
    `Gemini rate limit superado tras ${maxRetries} intentos.`,
    { cause: lastError },
  );
}

/** Resolves the API key, preferring the per-user key. Throws if none exist. */
function resolveApiKey(userApiKey?: string): string {
  const apiKey = userApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "No se encontró una API key de Gemini. Proporciona userApiKey o define " +
        "GEMINI_API_KEY en el entorno.",
    );
  }
  return apiKey;
}

/** Builds the system + user prompt for analysis. */
function buildAnalysisPrompt(
  postTitle: string,
  postContent: string,
  keyword: string,
): string {
  return [
    "Actúa como un experto en generación de leads para servicios de IPTV " +
      "(streaming de TV en vivo) y social listening en Reddit. Analiza el " +
      "siguiente post frente a la keyword objetivo del usuario.",
    "",
    "INTENCIÓN ALTA (intent_score 8-10):",
    "- El autor busca activamente recomendaciones de IPTV, proveedores " +
      "alternativos, listas M3U, códigos Xtream, o soluciones de streaming " +
      "para FireStick.",
    "- Expresa frustración con su proveedor actual o pide explícitamente a " +
      "dónde cambiarse.",
    "",
    "INTENCIÓN BAJA (intent_score menor a 6):",
    "- Discusiones, noticias, o consultas de soporte técnico sobre setups " +
      "existentes sin intención de cambiar o comprar.",
    "- Marca estos casos con un score bajo para que el pipeline los ignore.",
    "",
    "ESTRATEGIA DE RESPUESTA (suggested_reply):",
    "- Redacta una respuesta útil, natural y NO spam.",
    "- NO incluyas enlaces en la respuesta.",
    "- El objetivo es invitar de forma natural al autor a enviarte un " +
      "mensaje directo (DM) para una prueba gratis / línea de demo.",
    "- Mantenlo corto, profesional y amigable. P.ej.: 'Sent you a DM with " +
      "details' o 'If you're still looking, I can share a free trial code " +
      "via DM to test buffer-free streams'.",
    "",
    `KEYWORD OBJETIVO: ${keyword}`,
    "",
    `TÍTULO DEL POST: ${postTitle}`,
    "",
    `CONTENIDO DEL POST: ${postContent || "(sin contenido)"}`,
  ].join("\n");
}

/**
 * Parses the JSON returned by Gemini and validates it against
 * `RedditPostAnalysis`. Fails loudly if the shape is off so the caller knows.
 */
function parseAndValidate(json: string): RedditPostAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      "Gemini devolvió JSON no válido pese al responseSchema.",
      { cause: error },
    );
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.intent_score !== "number" ||
    typeof parsed.analysis_reasoning !== "string" ||
    typeof parsed.suggested_reply !== "string"
  ) {
    throw new Error(
      "La respuesta de Gemini no cumple el esquema esperado: " + json,
    );
  }

  return {
    intent_score: parsed.intent_score,
    analysis_reasoning: parsed.analysis_reasoning,
    suggested_reply: parsed.suggested_reply,
  };
}

/**
 * Detects a Gemini rate-limit (429) from an error object without importing
 * the SDK's error class. Returns a numeric status when the error carries one,
 * otherwise `undefined`.
 */
function getRateLimitStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function wrapError(error: unknown, ctx: { postTitle: string; keyword: string }): Error {
  if (error instanceof Error) {
    error.message = `[gemini:analyzeRedditPost] keyword="${ctx.keyword}" ` +
      `post="${ctx.postTitle.slice(0, 60) || "(vacío)"}" — ${error.message}`;
    return error;
  }
  return new Error(
    `[gemini:analyzeRedditPost] Error desconocido: ${String(error)}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
