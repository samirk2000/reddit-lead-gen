import type { MapsLeadReason, MapsLeadStatus } from "@/lib/supabase/types";

export const SPECIALTY_PRESETS = [
  "dentista",
  "dermatólogo",
  "cirujano plástico",
  "ortodoncista",
  "veterinario",
  "odontólogo",
  "médico estético",
  "nutriólogo",
  "oftalmólogo",
  "fisioterapeuta",
] as const;

export const STATUS_LABELS: Record<MapsLeadStatus, string> = {
  nuevo: "Nuevo",
  enviado_a_lista: "Enviado a lista",
  contactado: "Contactado",
  respondió: "Respondió",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

/** Fresh prospects first, then the daily list, then ones already worked. */
export const STATUS_SORT: Record<MapsLeadStatus, number> = {
  nuevo: 0,
  enviado_a_lista: 1,
  contactado: 2,
  respondió: 3,
  cerrado: 4,
  descartado: 5,
};

export const REASON_LABELS: Record<MapsLeadReason, string> = {
  sin_sitio: "Sin sitio web",
  solo_red_social: "Solo red social",
};

/** Same amount for every giro. The previous template did not vary the price. */
export const DEFAULT_OUTREACH_PRICE = "Desde $8,000 MXN";

/**
 * Short first-contact message. Not stored: it is always rendered per giro.
 * `{{apertura}}` is the stars/reviews clause, shortened when those numbers
 * are missing.
 */
export const OPENING_WHATSAPP_TEMPLATE = `Hola, le escribo de Torio Web. Vi {{nombre}} en Google Maps{{apertura}}Noté que no tiene página web y mucha gente busca "{{busqueda}} en {{ciudad}}" en Google antes de {{accion}}. ¿Le puedo mandar un ejemplo de cómo se vería la suya?`;

/**
 * Follow-up copy, saved in `maps_settings` when the operator customizes it.
 * Sent after the prospect accepts the opening, so it thanks them and describes
 * the page. It does not repeat the Google Maps greeting.
 * `{{cierre}}` is the example link when this giro has one, or an offer to
 * prepare a proposal when it does not. A saved custom template is left as-is.
 */
export const DEFAULT_WHATSAPP_TEMPLATE = `¡Gracias por su respuesta!

Le podemos hacer una página profesional donde muestre sus servicios, fotos de su {{lugar}} y trabajos, reseñas de {{clientes}} y un botón directo a WhatsApp para {{accion_corta}}. La dejamos optimizada para que Google la encuentre, y si le interesa, también escribimos artículos para su blog (por ejemplo, "{{ejemplo_blog}}") para que aparezca en más búsquedas de la zona.

${DEFAULT_OUTREACH_PRICE}. {{cierre}}`;

export const TEMPLATE_TOKENS = [
  "{{nombre}}",
  "{{especialidad}}",
  "{{calificacion}}",
  "{{reseñas}}",
  "{{ciudad}}",
  "{{reputacion}}",
  "{{clientes}}",
  "{{busqueda}}",
  "{{accion}}",
  "{{lugar}}",
  "{{accion_corta}}",
  "{{ejemplo_blog}}",
  "{{cierre}}",
] as const;

/** Successful Places searches allowed per user in a rolling hour. */
export const MAPS_SEARCHES_PER_HOUR = 30;

export const MAX_PLACE_PAGES = 3;

export const MISSING_PLACES_KEY_MESSAGE =
  "Falta GOOGLE_PLACES_API_KEY en el servidor. Agrégala en .env.local o en las variables de entorno de Vercel (sin el prefijo NEXT_PUBLIC_) y vuelve a desplegar. La guía está en docs/NEGOCIOS_SIN_WEB.md.";

export const MISSING_MAPS_SCHEMA_MESSAGE =
  "Falta aplicar la migración de prospectos. En Supabase → SQL Editor, ejecuta supabase/migrations/20260925_maps_leads.sql y vuelve a cargar esta página.";
