import type { MapsLeadReason, MapsLeadStatus } from "@/lib/supabase/types";

export const MAPS_LEAD_STATUSES = [
  "nuevo",
  "contactado",
  "respondió",
  "cerrado",
  "descartado",
] as const satisfies readonly MapsLeadStatus[];

export function isMapsLeadStatus(value: string): value is MapsLeadStatus {
  return (MAPS_LEAD_STATUSES as readonly string[]).includes(value);
}

/** Prospect draft before it is saved. Status and notes are intentionally absent. */
export type MapsLeadDraft = {
  placeId: string;
  name: string;
  address: string | null;
  phoneNational: string | null;
  phoneInternational: string | null;
  whatsappE164: string | null;
  rating: number | null;
  userRatingCount: number | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  businessStatus: string | null;
  specialty: string;
  city: string;
  leadReason: MapsLeadReason;
  priorityScore: number;
};

export type MapsSearchStats = {
  found: number;
  skippedClosed: number;
  withWebsite: number;
  duplicates: number;
  leads: number;
};

export type MapsSearchSummary = MapsSearchStats & {
  query: string;
  pages: number;
};

/** Subset of a Places API (New) Text Search place. */
export type RawPlace = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
};
