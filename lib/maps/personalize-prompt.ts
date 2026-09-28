import { DEFAULT_OUTREACH_PRICE } from "@/lib/maps/constants";
import type { MessageLead } from "@/lib/maps/message";
import { applyCity, resolveSector } from "@/lib/maps/sectors";
import type { MapsLeadReason } from "@/lib/supabase/types";

export type PersonalizePromptInput = MessageLead & {
  address: string | null;
  leadReason: MapsLeadReason;
  template: string;
  currentMessage: string;
};

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
  const blog = applyCity(resolveSector(input.specialty).ejemploBlog, input.city);

  return [
    "Eres el redactor de Torio Web, un estudio de páginas web en México.",
    "Escribe UN mensaje de WhatsApp para contactar a este negocio a mano.",
    "Trato de usted, tono respetuoso y breve. Español de México.",
    "No inventes datos, premios, ni que ya hablaste con ellos.",
    "No incluyas URLs, wa.me, ni digas que el mensaje se envió solo.",
    "Conserva la oferta y el precio si aparecen en la plantilla.",
    `Si la plantilla no trae precio, usa ${DEFAULT_OUTREACH_PRICE}.`,
    "Si la plantilla usa {{nombre}}, {{especialidad}}, {{calificacion}}, {{reseñas}} o {{ciudad}}, puedes dejarlos o sustituirlos con los datos de abajo.",
    "Incluye estos puntos de la oferta, adaptados al giro:",
    "- una página profesional que muestre servicios, fotos del lugar y del trabajo, y reseñas;",
    "- un botón directo a WhatsApp para que le escriban;",
    "- que la página se deja optimizada para que Google pueda encontrarla;",
    `- la opción de escribir artículos de blog para búsquedas de la zona, por ejemplo: "${blog}".`,
    "No prometas posiciones, primera página, rankings, más clientes ni resultados. Puedes decir que la página se optimiza para que Google pueda encontrarla y que un blog ayuda a aparecer en más búsquedas de la zona, pero no garantices que eso vaya a pasar.",
    "",
    `PLANTILLA:\n${input.template.slice(0, 1500)}`,
    "",
    `BORRADOR ACTUAL:\n${input.currentMessage.slice(0, 1500)}`,
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
