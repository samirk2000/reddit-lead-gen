import { externalDemoUrl } from "@/lib/demo/links";
import { DEFAULT_WHATSAPP_TEMPLATE, OPENING_WHATSAPP_TEMPLATE } from "@/lib/maps/constants";
import { applyCity, resolveSector } from "@/lib/maps/sectors";

export type MessageLead = {
  name: string;
  specialty: string;
  city: string;
  rating: number | null;
  userRatingCount: number | null;
};

const TOKEN_RE = /\{\{\s*([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_]+)\s*\}\}/g;
const DEMO_URL_TOKEN = /\{\{\s*demo_url\s*\}\}/i;

export function renderLeadMessage(template: string, lead: MessageLead): string {
  const sector = resolveSector(lead.specialty);
  const city = lead.city.trim();
  const source = city
    ? template
    : template.replace(/\s+en\s+\{\{\s*ciudad\s*\}\}/gi, "");
  const values: Record<string, string> = {
    nombre: lead.name,
    especialidad: lead.specialty,
    calificacion: formatRatingToken(lead.rating),
    resenas: formatReviewsToken(lead.userRatingCount),
    ciudad: city,
    reputacion: reputationClause(lead.rating, lead.userRatingCount, "followup"),
    apertura: reputationClause(lead.rating, lead.userRatingCount, "opening"),
    clientes: sector.clientes,
    busqueda: sector.busqueda,
    accion: sector.accion,
    lugar: sector.lugar,
    accion_corta: sector.accionCorta,
    ejemplo_blog: applyCity(sector.ejemploBlog, city),
    demo_url: demoLinkForLead(lead) ?? "",
  };

  return source.replace(TOKEN_RE, (token) => {
    const key = canonicalToken(token);
    return values[key] ?? "";
  });
}

/** First cold message. Always the short per-giro template, not the saved one. */
export function buildOpeningMessage(lead: MessageLead): string {
  return renderLeadMessage(OPENING_WHATSAPP_TEMPLATE, lead);
}

/**
 * Longer follow-up. `template` is the saved custom copy when the operator
 * has one; otherwise the Torio default. An external sample URL is appended
 * when this giro has one and the template did not already include it.
 */
export function buildFollowUpMessage(
  lead: MessageLead,
  options?: { template?: string },
): string {
  const template = options?.template?.trim()
    ? options.template
    : DEFAULT_WHATSAPP_TEMPLATE;
  const rendered = renderLeadMessage(template, lead).trimEnd();
  const url = demoLinkForLead(lead);
  const page = url?.split("?")[0];
  if (!url || !page || DEMO_URL_TOKEN.test(template) || rendered.includes(page)) {
    return rendered;
  }
  return `${rendered}\n\nAquí un ejemplo: ${url}`;
}

export function buildDefaultLeadMessage(lead: MessageLead): string {
  return buildFollowUpMessage(lead);
}

/** External sample URL for a lead, or null when that giro has none. */
export function demoLinkForLead(lead: MessageLead): string | null {
  const slug = resolveSector(lead.specialty).demoSlug;
  if (!slug) return null;
  return externalDemoUrl(slug, lead.name);
}

export function whatsAppHref(e164: string, message: string): string {
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

/** Legacy `{{calificacion}}` token. Kept for templates already saved by the user. */
function formatRatingToken(rating: number | null): string {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return "s/d";
  return rating.toFixed(1);
}

/** Legacy `{{reseñas}}` token. Missing stays "0", matching the previous template. */
function formatReviewsToken(reviewCount: number | null): string {
  if (typeof reviewCount !== "number" || !Number.isFinite(reviewCount)) return "0";
  return String(reviewCount);
}

/**
 * Opening clause after "en Google Maps". Includes the praise only when there
 * is a rating of at least 4 and at least one review. Missing numbers drop out
 * instead of rendering as "s/d" or "undefined".
 */
function reputationClause(
  rating: number | null,
  reviewCount: number | null,
  mode: "followup" | "opening",
): string {
  const ratingValue =
    typeof rating === "number" && Number.isFinite(rating) ? rating : null;
  const reviewValue =
    typeof reviewCount === "number" && Number.isFinite(reviewCount) && reviewCount > 0
      ? reviewCount
      : null;

  const ratingText =
    ratingValue == null
      ? null
      : `${ratingValue.toFixed(1)} ${ratingValue === 1 ? "estrella" : "estrellas"}`;
  const reviewLabel = reviewValue == null ? null : Math.round(reviewValue);
  const reviewsText =
    reviewLabel == null
      ? null
      : `${reviewLabel} ${reviewLabel === 1 ? "reseña" : "reseñas"}`;
  const mark = mode === "opening" ? "," : ":";

  if (ratingText && reviewsText && ratingValue != null && ratingValue >= 4) {
    return `${mark} ${ratingText} con ${reviewsText}, ¡muy buena reputación! `;
  }
  if (ratingText && reviewsText) {
    return `${mark} ${ratingText} con ${reviewsText}. `;
  }
  if (ratingText) return `${mark} ${ratingText}. `;
  if (reviewsText) return `, con ${reviewsText}. `;
  return ". ";
}

function canonicalToken(raw: string): string {
  return raw
    .replace(/[{}\s]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
