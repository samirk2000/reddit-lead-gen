import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  ensureSalesCtaInReply,
  formatCtaBlock,
  normalizeWebsiteUrl,
  resolveWhatsappHref,
  type SalesCta,
} from "@/lib/sales/cta";
import type { LeadChannel } from "@/lib/leads/channel";

/**
 * Structured output for a single analyzed Reddit/Quora post.
 */
export type RedditPostAnalysis = {
  intent_score: number;
  analysis_reasoning: string;
  /** Public Quora/Reddit-safe reply (no WhatsApp links). */
  suggested_reply: string;
  /** Private operator follow-up with WhatsApp/web CTA. */
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
        "Respuesta PÚBLICA segura: útil, natural, sin links de WhatsApp ni web de venta.",
    },
    suggested_reply_wa: {
      type: Type.STRING,
      description:
        "Follow-up PRIVADO para el operador con WhatsApp y/o web oficiales.",
    },
  },
  required: [
    "intent_score",
    "analysis_reasoning",
    "suggested_reply",
    "suggested_reply_wa",
  ],
};

export const GEMINI_MODEL = "gemini-3.6-flash";

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
  let publicReply = stripHardCtas(parsed.suggested_reply);
  if (channel === "quora") {
    publicReply = publicReply.trim();
  }

  const waReply = ensureSalesCtaInReply(
    parsed.suggested_reply_wa || buildDefaultWaFollowUp(salesCta),
    salesCta,
  );

  return {
    ...parsed,
    suggested_reply: publicReply,
    suggested_reply_wa: waReply,
  };
}

function stripHardCtas(reply: string): string {
  return reply
    .replace(/https?:\/\/(?:api\.)?whatsapp\.com\/\S+/gi, "")
    .replace(/https?:\/\/wa\.me\/\S+/gi, "")
    .replace(/WhatsApp:\s*\S+/gi, "")
    .replace(/Web:\s*https?:\/\/\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDefaultWaFollowUp(cta: SalesCta): string {
  const brand = cta.businessName?.trim() || "nosotros";
  const block = formatCtaBlock(cta);
  return [
    `Hola! Te escribo de ${brand}. Si querés te paso una prueba para Fire Stick / Android TV y te ayudo con la config.`,
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
  const channelRules =
    channel === "quora"
      ? [
          "CANAL: Quora (alto riesgo de ban / borrado).",
          "suggested_reply (PÚBLICA):",
          "- 100% útil: tips de estabilidad, peaking, prueba, soporte, Fire Stick.",
          "- PROHIBIDO: WhatsApp, wa.me, api.whatsapp.com, URL de venta, 'prueba gratis'.",
          "- Preferí CERO CTA de venta. Soft DM máximo: 'si querés te oriento por DM'.",
          "- Nunca digas que sos el mejor proveedor ni pegues marca/web.",
          "suggested_reply_wa (PRIVADA, solo operador):",
          "- Mensaje corto para DM o WhatsApp, CON links exactos de abajo.",
        ]
      : [
          "CANAL: Reddit.",
          "suggested_reply (PÚBLICA):",
          "- Útil y natural. Soft CTA a DM OK. Sin WhatsApp ni links de venta.",
          "suggested_reply_wa (PRIVADA):",
          "- Follow-up con WhatsApp/web exactos para cuando te escriban.",
        ];

  return [
    "Actúa como un experto en generación de leads IPTV para audiencia",
    "LATINOAMERICANA (español). Analiza el post frente a la keyword objetivo.",
    "",
    "PRIORIDAD: posts en español o LATAM buscando IPTV / Fire Stick.",
    "Posts 100% EN de US/EU → intent_score ≤4 salvo pedido explícito.",
    "",
    "INTENCIÓN ALTA (8-10): IPTV, proveedor, M3U, Xtream, prueba, Fire Stick.",
    "INTENCIÓN BAJA (<6): memes, noticias, leads gringos sin compra.",
    "",
    ...channelRules,
    ...ctaLines,
    "",
    `KEYWORD OBJETIVO: ${keyword}`,
    "",
    `TÍTULO DEL POST: ${postTitle}`,
    "",
    `CONTENIDO DEL POST: ${postContent || "(sin contenido)"}`,
  ].join("\n");
}

function buildCtaPromptLines(salesCta: SalesCta): string[] {
  const waHref = resolveWhatsappHref(salesCta);
  const site = normalizeWebsiteUrl(salesCta.websiteUrl);
  const brand = salesCta.businessName?.trim() || null;

  const lines = [
    "",
    "CONTACTO (SOLO para suggested_reply_wa — no para suggested_reply pública):",
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
