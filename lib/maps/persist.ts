import type { MapsLeadDraft } from "@/lib/maps/types";
import type { Database, MapsLeadStatus } from "@/lib/supabase/types";

export type MapsLeadInsert = Database["public"]["Tables"]["maps_leads"]["Insert"];

/**
 * Row written on search. notes are omitted on purpose: Postgres keeps the
 * existing value when that column is not in the upsert payload. status is
 * omitted unless the caller passes one (the daily list marks enviado_a_lista).
 */
export function leadDraftToInsert(
  userId: string,
  draft: MapsLeadDraft,
  seenAt: string,
  status?: MapsLeadStatus,
): MapsLeadInsert {
  const row: MapsLeadInsert = {
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
  if (status) row.status = status;
  return row;
}
