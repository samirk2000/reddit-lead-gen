import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/maps/constants";
import { applyCity, resolveSector } from "@/lib/maps/sectors";

export type MessageLead = {
  name: string;
  specialty: string;
  city: string;
  rating: number | null;
  userRatingCount: number | null;
};

const TOKEN_RE = /\{\{\s*([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_]+)\s*\}\}/g;

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
    reputacion: reputationClause(lead.rating, lead.userRatingCount),
    clientes: sector.clientes,
    busqueda: sector.busqueda,
    accion: sector.accion,
    lugar: sector.lugar,
    accion_corta: sector.accionCorta,
    ejemplo_blog: applyCity(sector.ejemploBlog, city),
  };

  return source.replace(TOKEN_RE, (token) => {
    const key = canonicalToken(token);
    return values[key] ?? "";
  });
}

export function buildDefaultLeadMessage(lead: MessageLead): string {
  return renderLeadMessage(DEFAULT_WHATSAPP_TEMPLATE, lead);
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
function reputationClause(rating: number | null, reviewCount: number | null): string {
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

  if (ratingText && reviewsText && ratingValue != null && ratingValue >= 4) {
    return `: ${ratingText} con ${reviewsText}, ¡muy buena reputación! `;
  }
  if (ratingText && reviewsText) {
    return `: ${ratingText} con ${reviewsText}. `;
  }
  if (ratingText) return `: ${ratingText}. `;
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
