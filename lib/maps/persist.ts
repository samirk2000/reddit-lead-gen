import type { MapsLeadDraft } from "@/lib/maps/types";
import type { Database } from "@/lib/supabase/types";

export type MapsLeadInsert = Database["public"]["Tables"]["maps_leads"]["Insert"];

/**
 * Row written on search. status and notes are omitted on purpose: Postgres
 * keeps the existing values when those columns are not in the upsert payload.
 */
export function leadDraftToInsert(
  userId: string,
  draft: MapsLeadDraft,
  seenAt: string,
): MapsLeadInsert {
  return {
    user_id: userId,
    place_id: draft.placeId,
    name: draft.name,
    address: draft.address,
    phone_national: draft.phoneNational,
    phone_international: draft.phoneInternational,
    whatsapp_e164: draft.whatsappE164,
    rating: draft.rating,
    user_rating_count: draft.userRatingCount,
    website_uri: draft.websiteUri,
    google_maps_uri: draft.googleMapsUri,
    business_status: draft.businessStatus,
    specialty: draft.specialty,
    city: draft.city,
    lead_reason: draft.leadReason,
    priority_score: draft.priorityScore,
    last_seen_at: seenAt,
  };
}
