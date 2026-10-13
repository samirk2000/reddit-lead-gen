import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { geminiModel } from "@/lib/config/runtime";
import type { LeadChannel } from "@/lib/leads/channel";
import {
  ensureSalesCtaInReply,
  formatCtaBlock,
  normalizeWebsiteUrl,
  resolveWhatsappHref,
  type SalesCta,
} from "@/lib/sales/cta";
import {
  DISCOUNT_CODE,
  DISCOUNT_PERCENT,
  enforceSellerReply,
  WHATSAPP_DISPLAY,
} from "@/lib/sales/reply-rules";

/**
 * Structured output for a single analyzed Reddit/Quora post.
 */
export type RedditPostAnalysis = {
  intent_score: number;
  analysis_reasoning: string;
  /** Paste-ready reply: seller disclosure, REDDIT15, WhatsApp, Android-first. */
  suggested_reply: string;
  /** Shorter WhatsApp follow-up with the same facts. */
  suggested_reply_wa: string;
};

export type AnalyzePostOptions = {
  userApiKey?: string | undefined;
  salesCta?: SalesCta | undefined;
  channel?: LeadChannel | undefined;
};

export const REDDIT_ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    "Análisis estructurado de un post frente a una keyword objetivo.",
  properties: {
    intent_score: {
      type: Type.INTEGER,
      description:
        "Puntuación de intención de compra / dolor inminente de 1 a 10.",
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
        "Respuesta en español de México para pegar a mano. El autor dice que vende el servicio, incluye el código REDDIT15 y el WhatsApp, y habla de Android, Android TV, Firestick o Google TV.",
    },
    suggested_reply_wa: {
      type: Type.STRING,
      description:
        "Mensaje corto de WhatsApp con la misma honestidad de vendedor, el código REDDIT15 y el número.",
    },
  },
  required: [
    "intent_score",
    "analysis_reasoning",
    "suggested_reply",
    "suggested_reply_wa",
  ],
};

export { geminiModel };

export async function analyzeRedditPost(
  postTitle: string,
  postContent: string,
  keyword: string,
  options?: string | AnalyzePostOptions,
): Promise<RedditPostAnalysis> {
  const opts: AnalyzePostOptions =
    typeof options === "string" ? { userApiKey: options } : options ?? {};
  const apiKey = resolveApiKey(opts.userApiKey);
  const salesCta = opts.salesCta ?? {};
  const channel: LeadChannel = opts.channel ?? "reddit";

  const prompt = buildAnalysisPrompt(
    postTitle,
    postContent,
    keyword,
    salesCta,
    channel,
  );

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
        model: geminiModel(),
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

      const parsed = parseAndValidate(text);
      return finalizeReplies(parsed, salesCta, channel);
    } catch (error) {
      const status = getRateLimitStatus(error);
      if (status !== undefined) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          continue;
        }
      }
      const wrapped = wrapError(error, { postTitle, keyword });
      console.error(
        `[gemini] Error al analizar post con "${keyword}": ${wrapped.message}`,
      );
      throw wrapped;
    }
  }

  throw new Error(
    `Gemini rate limit superado tras ${maxRetries} intentos.`,
    { cause: lastError },
  );
}

function finalizeReplies(
  parsed: RedditPostAnalysis,
  salesCta: SalesCta,
  channel: LeadChannel,
): RedditPostAnalysis {
  void channel;
  const brand = salesCta.businessName;
  const publicReply = enforceSellerReply(parsed.suggested_reply, brand);
  const waReply = ensureSalesCtaInReply(
    enforceSellerReply(
      parsed.suggested_reply_wa || buildDefaultWaFollowUp(salesCta),
      brand,
    ),
    salesCta,
  );

  return {
    ...parsed,
    intent_score: clampIntentScore(parsed.intent_score),
    suggested_reply: publicReply,
    suggested_reply_wa: waReply,
  };
}

function clampIntentScore(value: number): number {
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 10) return 10;
  return rounded;
}

function buildDefaultWaFollowUp(cta: SalesCta): string {
  const brand = cta.businessName?.trim() || "Swiftya Latino";
  const block = formatCtaBlock(cta);
  return [
    `Hola. Te escribo de ${brand}. Yo vendo este servicio, no soy un cliente que ya lo usa.`,
    `Está armado para Android, Android TV, Firestick y Google TV.`,
    `Con el código ${DISCOUNT_CODE} tienes ${DISCOUNT_PERCENT}% de descuento.`,
    `WhatsApp: ${WHATSAPP_DISPLAY}.`,
    block ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

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

function buildAnalysisPrompt(
  postTitle: string,
  postContent: string,
  keyword: string,
  salesCta: SalesCta,
  channel: LeadChannel,
): string {
  const ctaLines = buildCtaPromptLines(salesCta);
  const where =
    channel === "quora"
      ? "El operador va a pegar suggested_reply en Quora a mano."
      : "El operador va a pegar suggested_reply en Reddit a mano.";

  return [
    "Eres el asistente de un vendedor de IPTV en México (Swiftya Latino).",
    "Analiza el post frente a la frase objetivo y redacta en español de México (tú, no vos).",
    "",
    "PRIORIDAD: gente en México o Latinoamérica que quiere comprar o reemplazar IPTV,",
    "sobre todo si usa Android, Android TV, Firestick o Google TV.",
    "Posts en inglés de Estados Unidos o Europa sin pedido de compra: intent_score de 4 o menos.",
    "",
    "INTENCIÓN ALTA (8-10): busco iptv, recomienden iptv, se cayó mi iptv,",
    "iptv firestick, cancelar cable, proveedor, M3U, prueba, lista.",
    "INTENCIÓN BAJA (menos de 6): memes, noticias, quejas sin ganas de comprar.",
    "",
    where,
    "La app NUNCA publica el texto. Solo lo guarda para que una persona lo copie.",
    "",
    "REGLAS DE suggested_reply Y suggested_reply_wa (las dos):",
    "- Di de frente que TÚ vendes el servicio. Nunca te hagas pasar por un cliente satisfecho.",
    "- Incluye esta frase o una equivalente: \"yo vendo este servicio, no soy un cliente\".",
    `- Incluye el código ${DISCOUNT_CODE} y que es ${DISCOUNT_PERCENT}% de descuento.`,
    `- Incluye el WhatsApp escrito así: ${WHATSAPP_DISPLAY}.`,
    "- Prioriza a quien usa Android, Android TV, Firestick o Google TV.",
    "- Si la persona habla de otro aparato, invítala a esos dispositivos sin atacar el suyo.",
    "- PROHIBIDO mencionar limitaciones de audio en Roku, problemas de sonido en Roku,",
    "  o cualquier queja de audio de Roku. No hables de Roku.",
    "- suggested_reply: 4 a 8 frases, útil y directa, lista para pegar.",
    "- suggested_reply_wa: mensaje más corto para WhatsApp, con los mismos datos.",
    ...ctaLines,
    "",
    `FRASE OBJETIVO: ${keyword}`,
    "",
    `TÍTULO: ${postTitle}`,
    "",
    `CONTENIDO: ${postContent || "(sin contenido)"}`,
  ].join("\n");
}

function buildCtaPromptLines(salesCta: SalesCta): string[] {
  const waHref = resolveWhatsappHref(salesCta);
  const site = normalizeWebsiteUrl(salesCta.websiteUrl);
  const brand = salesCta.businessName?.trim() || null;

  const lines = [
    "",
    "CONTACTO (inclúyelo en las dos respuestas, además del número de arriba):",
  ];
  if (brand) lines.push(`- Marca: ${brand}`);
  if (waHref) lines.push(`- WhatsApp exacto: ${waHref}`);
  if (site) lines.push(`- Web exacta: ${site}`);
  if (!waHref && !site) {
    lines.push("- (sin contacto configurado — no inventes links)");
  }
  return lines;
}

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

  const wa =
    typeof parsed.suggested_reply_wa === "string"
      ? parsed.suggested_reply_wa
      : "";

  return {
    intent_score: parsed.intent_score,
    analysis_reasoning: parsed.analysis_reasoning,
    suggested_reply: parsed.suggested_reply,
    suggested_reply_wa: wa,
  };
}

function getRateLimitStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function wrapError(
  error: unknown,
  ctx: { postTitle: string; keyword: string },
): Error {
  if (error instanceof Error) {
    error.message =
      `[gemini:analyzeRedditPost] keyword="${ctx.keyword}" ` +
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
