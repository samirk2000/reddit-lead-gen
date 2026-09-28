import type { MessageLead } from "@/lib/maps/message";
import { resolveSector } from "@/lib/maps/sectors";
import type { MapsLeadReason } from "@/lib/supabase/types";

export type PersonalizePromptInput = MessageLead & {
  address: string | null;
  leadReason: MapsLeadReason;
  template: string;
  currentMessage: string;
};

/** Prompt for the short opening message. The follow-up keeps the long offer. */
export function buildPersonalizePrompt(input: PersonalizePromptInput): string {
  const reason =
    input.leadReason === "solo_red_social"
      ? "El único sitio publicado es una red social o un link-in-bio, no una página propia."
      : "No tiene sitio web publicado en Google.";
  const rating =
    input.rating == null || !Number.isFinite(input.rating)
      ? "sin calificación"
      : input.rating.toFixed(1);
  const reviews =
    input.userRatingCount == null || !Number.isFinite(input.userRatingCount)
      ? "sin reseñas"
      : String(input.userRatingCount);
  const sector = resolveSector(input.specialty);

  return [
    "Eres el redactor de Torio Web, un estudio de páginas web en México.",
    "Escribe UN mensaje corto de apertura de WhatsApp, el primer contacto.",
    "Máximo 3 líneas y 420 caracteres.",
    "Trato de usted. Español de México. Tono respetuoso y directo.",
    "Menciona que viste el negocio en Google Maps.",
    "Si hay calificación y reseñas, inclúyelas. Si faltan, no inventes números ni digas que la reputación es buena.",
    `Di que notaste que no tiene página web y que la gente busca "${sector.busqueda}" en su ciudad antes de ${sector.accion}.`,
    "Cierra preguntando si le puedes mandar un ejemplo de cómo se vería su página.",
    "No incluyas precio, lista de servicios, artículos, URLs ni wa.me. Eso va en un segundo mensaje.",
    "No prometas posiciones, primera página, rankings, más clientes ni resultados.",
    "No inventes datos, premios, ni que ya hablaron.",
    "",
    `BORRADOR:\n${input.currentMessage.slice(0, 800)}`,
    "",
    `NEGOCIO: ${input.name}`,
    `GIRO: ${input.specialty}`,
    `CIUDAD: ${input.city}`,
    `DIRECCIÓN: ${input.address?.slice(0, 300) || "(sin dirección)"}`,
    `CALIFICACIÓN: ${rating}`,
    `RESEÑAS: ${reviews}`,
    `SITIO: ${reason}`,
  ].join("\n");
}
