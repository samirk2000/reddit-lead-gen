import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/ai/gemini";
import { renderLeadMessage } from "@/lib/maps/message";
import {
  buildPersonalizePrompt,
  type PersonalizePromptInput,
} from "@/lib/maps/personalize-prompt";
import { MapsError } from "@/lib/maps/errors";

const PERSONALIZE_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: "Mensaje de WhatsApp listo para que el operador lo envíe a mano.",
  properties: {
    message: {
      type: Type.STRING,
      description:
        "Apertura corta en español de México, trato de usted, máximo 3 líneas y 420 caracteres, sin URLs y sin promesas de ranking.",
    },
  },
  required: ["message"],
};

export type PersonalizeInput = PersonalizePromptInput;

export async function personalizeMapsMessage(
  input: PersonalizeInput,
  userApiKey?: string,
): Promise<string> {
  const apiKey = userApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new MapsError(
      "MISSING_GEMINI_KEY",
      "No hay API key de Gemini. Pégala en Settings o define GEMINI_API_KEY en el servidor.",
    );
  }

  const genAI = new GoogleGenAI({ apiKey });
  const prompt = buildPersonalizePrompt(input);
  const initialDelayMs = 1500;
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    if (attempt > 0) {
      await delay(initialDelayMs * Math.pow(2, attempt - 1));
    }

    try {
      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: PERSONALIZE_SCHEMA,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini devolvió una respuesta vacía.");
      }
      const message = parseMessage(text);
      return renderLeadMessage(message, input).slice(0, 500);
    } catch (error) {
      if (error instanceof MapsError) throw error;
      if (getRateLimitStatus(error) === 429) {
        lastError = error;
        if (attempt < maxRetries - 1) continue;
        console.error("[maps] gemini rate limit", {
          name: input.name,
          attempts: maxRetries,
        });
        throw new MapsError(
          "GEMINI_RATE_LIMIT",
          "Gemini está limitando las solicitudes. Espera un momento e intenta de nuevo.",
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("[maps] personalize failed", {
        name: input.name,
        specialty: input.specialty,
        error: message,
      });
      throw new MapsError(
        "GEMINI",
        "No se pudo personalizar el mensaje con IA. Intenta de nuevo en un momento.",
      );
    }
  }

  console.error("[maps] personalize exhausted retries", {
    name: input.name,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw new MapsError(
    "GEMINI_RATE_LIMIT",
    "Gemini está limitando las solicitudes. Espera un momento e intenta de nuevo.",
  );
}

function parseMessage(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("Gemini devolvió JSON no válido.", { cause: error });
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("message" in parsed) ||
    typeof parsed.message !== "string" ||
    !parsed.message.trim()
  ) {
    throw new Error("La respuesta de Gemini no trae un mensaje.");
  }
  return parsed.message.trim();
}

function getRateLimitStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 429) return 429;
  }
  if (error instanceof Error && /429|RESOURCE_EXHAUSTED/i.test(error.message)) {
    return 429;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
