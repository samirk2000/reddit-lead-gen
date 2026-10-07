import { bestMexicanPhone, type MexicanPhoneKind } from "@/lib/maps/phone";
import { marketScoreForSpecialty } from "@/lib/maps/sectors";
import type { MapsLeadReason } from "@/lib/supabase/types";

/**
 * Points out of 100. Giro is the largest slice so a high-ticket business
 * beats a low-ticket one when both can be contacted. A missing phone is
 * capped so it sorts after businesses we can actually message.
 */
const GIRO_WEIGHT = 40;
const PHONE_POINTS: Record<MexicanPhoneKind, number> = {
  mobile: 22,
  possible: 16,
  none: 0,
};
const WEBSITE_POINTS: Record<MapsLeadReason, number> = {
  sin_sitio: 14,
  solo_red_social: 6,
};
const NO_PHONE_CAP = 40;

export type ProspectScoreInput = {
  specialty: string;
  leadReason: MapsLeadReason;
  rating: number | null;
  reviewCount: number | null;
  phoneKind: MexicanPhoneKind;
  businessStatus: string | null;
};

export type ProspectScore = {
  score: number;
  reason: string;
};

export function scoreProspect(input: ProspectScoreInput): ProspectScore {
  const market = marketScoreForSpecialty(input.specialty);
  const giroPoints = Math.round((market / 100) * GIRO_WEIGHT);
  const phonePoints = PHONE_POINTS[input.phoneKind];
  const websitePoints = WEBSITE_POINTS[input.leadReason];
  const activity = activityPoints(input.rating, input.reviewCount);
  const status = input.businessStatus?.trim() || null;
  const statusPoints =
    status === "OPERATIONAL" ? 6 : status === "CLOSED_TEMPORARILY" ? 0 : 3;

  let score = giroPoints + phonePoints + websitePoints + activity + statusPoints;
  if (status === "CLOSED_TEMPORARILY") score -= 10;
  if (input.phoneKind === "none") score = Math.min(score, NO_PHONE_CAP);
  score = clamp(score, 0, 100);

  return { score, reason: scoreReason(input, market) };
}

export function scoreMapsLead(lead: {
  specialty: string;
  lead_reason: MapsLeadReason;
  rating: number | null;
  user_rating_count: number | null;
  phone_national: string | null;
  phone_international: string | null;
  whatsapp_e164: string | null;
  business_status: string | null;
}): ProspectScore {
  const phone = bestMexicanPhone(lead.phone_international, lead.phone_national);
  const phoneKind: MexicanPhoneKind =
    phone.kind !== "none" ? phone.kind : lead.whatsapp_e164 ? "possible" : "none";
  return scoreProspect({
    specialty: lead.specialty,
    leadReason: lead.lead_reason,
    rating: lead.rating,
    reviewCount: lead.user_rating_count,
    phoneKind,
    businessStatus: lead.business_status,
  });
}

function activityPoints(rating: number | null, reviews: number | null): number {
  if (rating == null || reviews == null || !(rating > 0) || !(reviews > 0)) return 0;
  if (rating >= 4 && reviews >= 15) {
    const ratingBonus = ((Math.min(rating, 5) - 4) / 1) * 4;
    const reviewBonus = Math.min(Math.log10(reviews) / Math.log10(500), 1) * 6;
    return Math.round(8 + ratingBonus + reviewBonus);
  }
  if (rating >= 4 && reviews >= 5) return 5;
  if (rating >= 4) return 3;
  if (reviews >= 15) return 3;
  return 1;
}

function scoreReason(input: ProspectScoreInput, market: number): string {
  const parts: string[] = [];
  if (market >= 80) parts.push("Alto valor");
  else if (market <= 20) parts.push("Bajo valor");

  parts.push(input.leadReason === "sin_sitio" ? "sin sitio web" : "solo red social");

  if (input.phoneKind === "mobile") parts.push("WhatsApp móvil");
  else if (input.phoneKind === "possible") parts.push("teléfono para WhatsApp");
  else parts.push("sin teléfono");

  const rating = input.rating;
  const reviews = input.reviewCount;
  if (
    rating != null &&
    reviews != null &&
    rating >= 4 &&
    reviews >= 15
  ) {
    parts.push(`${rating.toFixed(1)} y ${reviews} reseñas`);
  } else if (reviews != null && reviews > 0) {
    parts.push("poca actividad en reseñas");
  } else {
    parts.push("sin reseñas suficientes");
  }

  if (input.businessStatus === "OPERATIONAL") parts.push("en operación");
  else if (input.businessStatus === "CLOSED_TEMPORARILY") {
    parts.push("cerrado temporalmente");
  }

  return parts.join(" · ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
