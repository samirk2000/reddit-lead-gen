import type {
  RedditWebLeadEstado,
  RedditWebLeadIdioma,
} from "@/lib/supabase/types";

export const REDDIT_WEB_PATH = "/dashboard/reddit-web";

export const REDDIT_WEB_MIGRATION_FILE =
  "supabase/migrations/20260928_reddit_web_leads.sql";

/** Pipeline order shown in the dashboard. */
export const REDDIT_WEB_ESTADOS = [
  "nuevo",
  "respondido",
  "contactado",
  "cotizado",
  "ganado",
  "descartado",
] as const satisfies readonly RedditWebLeadEstado[];

export const REDDIT_WEB_ESTADO_LABELS: Record<RedditWebLeadEstado, string> = {
  nuevo: "Nuevo",
  respondido: "Respondido",
  contactado: "Contactado",
  cotizado: "Cotizado",
  ganado: "Ganado",
  descartado: "Descartado",
};

export const REDDIT_WEB_IDIOMAS = ["es-MX", "en-US"] as const satisfies readonly RedditWebLeadIdioma[];

export const REDDIT_WEB_IDIOMA_LABELS: Record<RedditWebLeadIdioma, string> = {
  "es-MX": "Español (México)",
  "en-US": "Inglés (EE. UU.)",
};

export function isRedditWebLeadEstado(
  value: string,
): value is RedditWebLeadEstado {
  return (REDDIT_WEB_ESTADOS as readonly string[]).includes(value);
}

export const MISSING_REDDIT_WEB_SCHEMA_MESSAGE =
  "Falta aplicar la migración de leads de Reddit. En Supabase → SQL Editor, ejecuta supabase/migrations/20260928_reddit_web_leads.sql y vuelve a cargar esta página.";

export const REDDIT_WEB_MANUAL_REPLY_REMINDER =
  "Tú publicas la respuesta a mano. El bot no comenta en Reddit. Antes de publicar, lee las reglas de autopromoción de ese subreddit: en muchos está prohibido vender, poner enlaces o hablar de tus servicios.";
