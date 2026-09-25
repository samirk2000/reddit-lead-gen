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
  contactado: "Contactado",
  respondió: "Respondió",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

export const REASON_LABELS: Record<MapsLeadReason, string> = {
  sin_sitio: "Sin sitio web",
  solo_red_social: "Solo red social",
};

export const DEFAULT_WHATSAPP_TEMPLATE = `Hola, le escribo de Torio Web. Estuve viendo {{nombre}} en Google ({{calificacion}} estrellas, {{reseñas}} reseñas) en {{ciudad}} y no encontré un sitio web del consultorio.

Hacemos landing pages para {{especialidad}}, alrededor de $8,000 MXN, para que los pacientes lo encuentren y puedan escribir por WhatsApp. ¿Le gustaría ver un ejemplo?`;

export const TEMPLATE_TOKENS = [
  "{{nombre}}",
  "{{especialidad}}",
  "{{calificacion}}",
  "{{reseñas}}",
  "{{ciudad}}",
] as const;

/** Successful Places searches allowed per user in a rolling hour. */
export const MAPS_SEARCHES_PER_HOUR = 30;

export const MAX_PLACE_PAGES = 3;

export const MISSING_PLACES_KEY_MESSAGE =
  "Falta GOOGLE_PLACES_API_KEY en el servidor. Agrégala en .env.local o en las variables de entorno de Vercel (sin el prefijo NEXT_PUBLIC_) y vuelve a desplegar. La guía está en docs/NEGOCIOS_SIN_WEB.md.";

export const MISSING_MAPS_SCHEMA_MESSAGE =
  "Falta aplicar la migración de prospectos. En Supabase → SQL Editor, ejecuta supabase/migrations/20260925_maps_leads.sql y vuelve a cargar esta página.";
