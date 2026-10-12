import { MapsError } from "@/lib/maps/errors";
import type { MapsLeadStatus } from "@/lib/supabase/types";

/** Statuses this endpoint accepts. `respondio` is stored as `respondió`. */
const MARK_STATUS_KEYS = new Set(["contactado", "respondio", "descartado"]);

export type MarkStatusRequest = {
  placeId: string | null;
  phoneLast10: string | null;
  status: MapsLeadStatus;
};

export type MarkableLead = {
  id: string;
  place_id: string;
  status: MapsLeadStatus;
  whatsapp_e164: string | null;
  phone_national: string | null;
  phone_international: string | null;
  updated_at: string;
};

export type MarkStatusDecision = {
  unchanged: boolean;
  status: MapsLeadStatus;
};

/**
 * Body of POST /api/maps/mark-status.
 * Needs `place_id` or `phone`, and status contactado | respondio | descartado.
 */
export function parseMarkStatusBody(body: unknown): MarkStatusRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MapsError("BAD_QUERY", "El cuerpo debe ser un objeto JSON.");
  }
  const record = body as Record<string, unknown>;
  const placeId = stringField(record.place_id);
  const phone = stringField(record.phone);
  if (!placeId && !phone) {
    throw new MapsError("BAD_QUERY", "Indica place_id o phone.");
  }
  if (placeId.length > 300) {
    throw new MapsError("BAD_QUERY", "place_id es demasiado largo.");
  }

  const status = markStatusFromInput(record.status);
  if (!status) {
    throw new MapsError(
      "BAD_QUERY",
      "status debe ser contactado, respondio o descartado.",
    );
  }

  let phoneLast10: string | null = null;
  if (phone) {
    phoneLast10 = last10Digits(phone);
    if (!phoneLast10) {
      throw new MapsError("BAD_QUERY", "phone debe incluir al menos 10 dígitos.");
    }
  }

  return {
    placeId: placeId || null,
    phoneLast10,
    status,
  };
}

/** Last 10 digits, so 52…, 521… and a local number identify the same line. */
export function last10Digits(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function leadMatchesPhone(lead: MarkableLead, phoneLast10: string): boolean {
  return [lead.whatsapp_e164, lead.phone_national, lead.phone_international].some(
    (value) => (value ? last10Digits(value) === phoneLast10 : false),
  );
}

/** Newest `updated_at` wins when several rows share those 10 digits. */
export function pickPhoneMatch(
  leads: readonly MarkableLead[],
  phoneLast10: string,
): MarkableLead | null {
  const matches = leads.filter((lead) => leadMatchesPhone(lead, phoneLast10));
  matches.sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}

/** place_id wins. Phone is only used when that id is missing or unknown. */
export function chooseMarkTarget(
  byPlaceId: MarkableLead | null,
  phoneCandidates: readonly MarkableLead[],
  phoneLast10: string | null,
): MarkableLead | null {
  if (byPlaceId) return byPlaceId;
  if (!phoneLast10) return null;
  return pickPhoneMatch(phoneCandidates, phoneLast10);
}

/**
 * `cerrado` stays cerrado. Writing the status the row already has is a no-op.
 * Anything else, including contactado after respondió, is applied.
 */
export function markStatusDecision(
  current: MapsLeadStatus,
  next: MapsLeadStatus,
): MarkStatusDecision {
  if (current === "cerrado" || current === next) {
    return { unchanged: true, status: current };
  }
  return { unchanged: false, status: next };
}

function markStatusFromInput(value: unknown): MapsLeadStatus | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!MARK_STATUS_KEYS.has(key)) return null;
  if (key === "respondio") return "respondió";
  if (key === "contactado") return "contactado";
  if (key === "descartado") return "descartado";
  return null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
