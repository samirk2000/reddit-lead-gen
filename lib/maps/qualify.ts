import { normalizeMexicanWhatsApp } from "@/lib/maps/phone";
import type {
  MapsLeadDraft,
  MapsSearchStats,
  RawPlace,
} from "@/lib/maps/types";
import type { MapsLeadReason } from "@/lib/supabase/types";

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "instagr.am",
  "linktr.ee",
  "linktree.com",
  "wa.me",
  "whatsapp.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "t.me",
  "telegram.me",
  "telegram.org",
  "snapchat.com",
  "pinterest.com",
  "pin.it",
  "threads.net",
  "g.page",
  "goo.gl",
  "maps.google.com",
  "business.google.com",
];

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function websiteHost(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function isSocialWebsite(uri: string): boolean {
  const host = websiteHost(uri);
  if (!host) return false;
  return SOCIAL_HOSTS.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function qualifyWebsite(
  uri: string | null | undefined,
): { lead: true; reason: MapsLeadReason } | { lead: false } {
  const trimmed = uri?.trim() ?? "";
  if (!trimmed || !websiteHost(trimmed)) return { lead: true, reason: "sin_sitio" };
  if (isSocialWebsite(trimmed)) return { lead: true, reason: "solo_red_social" };
  return { lead: false };
}

/**
 * 0–100. Rating is weighted against a log scale of review volume so a 5.0
 * with two reviews does not beat a busy 4.7 clinic.
 * 100 ≈ 5.0 stars and about 1,000 reviews.
 */
export function priorityScore(
  rating: number | null,
  reviewCount: number | null,
): number {
  if (rating == null || reviewCount == null || rating <= 0 || reviewCount <= 0) {
    return 0;
  }
  const ratingFactor = Math.min(rating, 5) / 5;
  const reviewFactor = Math.min(Math.log10(reviewCount + 1) / Math.log10(1001), 1);
  return Math.round(ratingFactor * reviewFactor * 100);
}

export function placeIdOf(place: RawPlace): string | null {
  const id = place.id?.trim();
  if (id) return id;
  const name = place.name?.trim();
  if (name?.startsWith("places/")) {
    const parsed = name.slice("places/".length).trim();
    return parsed || null;
  }
  return null;
}

export function buildLeadDrafts(
  places: RawPlace[],
  specialty: string,
  city: string,
): { drafts: MapsLeadDraft[]; stats: MapsSearchStats } {
  const seen = new Set<string>();
  const drafts: MapsLeadDraft[] = [];
  const stats: MapsSearchStats = {
    found: places.length,
    skippedClosed: 0,
    withWebsite: 0,
    duplicates: 0,
    leads: 0,
  };

  for (const place of places) {
    const placeId = placeIdOf(place);
    if (!placeId) continue;
    if (seen.has(placeId)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(placeId);

    if (place.businessStatus === "CLOSED_PERMANENTLY") {
      stats.skippedClosed += 1;
      continue;
    }

    const qualification = qualifyWebsite(place.websiteUri);
    if (!qualification.lead) {
      stats.withWebsite += 1;
      continue;
    }

    const phoneInternational = place.internationalPhoneNumber?.trim() || null;
    const phoneNational = place.nationalPhoneNumber?.trim() || null;
    const rating = typeof place.rating === "number" ? place.rating : null;
    const userRatingCount =
      typeof place.userRatingCount === "number" ? place.userRatingCount : null;

    drafts.push({
      placeId,
      name: place.displayName?.text?.trim() || "Sin nombre",
      address: place.formattedAddress?.trim() || null,
      phoneNational,
      phoneInternational,
      whatsappE164: normalizeMexicanWhatsApp(phoneInternational || phoneNational),
      rating,
      userRatingCount,
      websiteUri: place.websiteUri?.trim() || null,
      googleMapsUri: place.googleMapsUri?.trim() || null,
      businessStatus: place.businessStatus?.trim() || null,
      specialty,
      city,
      leadReason: qualification.reason,
      priorityScore: priorityScore(rating, userRatingCount),
    });
  }

  stats.leads = drafts.length;
  drafts.sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );
  return { drafts, stats };
}
