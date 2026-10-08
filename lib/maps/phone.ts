/**
 * Normalizes a Mexican phone number to wa.me digits: 52 + 10 digits.
 * Returns null when it cannot be treated as a Mexican mobile or landline.
 */
export function normalizeMexicanWhatsApp(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (
    (digits.startsWith("044") || digits.startsWith("045")) &&
    digits.length >= 13
  ) {
    digits = digits.slice(3);
  }

  if (digits.startsWith("01") && digits.length > 10) {
    digits = digits.slice(2);
  }

  // Legacy WhatsApp format was 521 + 10 digits. wa.me now uses 52 + 10.
  if (digits.startsWith("521") && digits.length === 13) {
    digits = `52${digits.slice(3)}`;
  }

  if (digits.length === 10) {
    digits = `52${digits}`;
  }

  if (digits.startsWith("52") && digits.length === 12) return digits;
  return null;
}

/** Confirmed mobile, a Mexican number that may be mobile, or unusable. */
export type MexicanPhoneKind = "mobile" | "possible" | "none";

/**
 * `mobile` when the raw value still has a mobile marker (521, 044, 045).
 * Google often returns mobiles as a plain 10-digit number; those stay
 * `possible` so they are not labeled landlines, and they still open wa.me.
 */
export function classifyMexicanPhone(input: string | null | undefined): {
  e164: string | null;
  kind: MexicanPhoneKind;
} {
  const e164 = normalizeMexicanWhatsApp(input);
  if (!e164) return { e164: null, kind: "none" };
  return { e164, kind: hasMobileMarker(input) ? "mobile" : "possible" };
}

/** Prefers a confirmed mobile when either published number has the marker. */
export function bestMexicanPhone(
  international: string | null | undefined,
  national: string | null | undefined,
): { e164: string | null; kind: MexicanPhoneKind } {
  const ranked = [international, national].map((value) => classifyMexicanPhone(value));
  const mobile = ranked.find((item) => item.kind === "mobile");
  if (mobile?.e164) return mobile;
  const possible = ranked.find((item) => item.kind === "possible");
  if (possible?.e164) return possible;
  return { e164: null, kind: "none" };
}

function hasMobileMarker(input: string | null | undefined): boolean {
  if (!input) return false;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("521") && digits.length >= 13) return true;
  if (
    (digits.startsWith("044") || digits.startsWith("045")) &&
    digits.length >= 13
  ) {
    return true;
  }
  return false;
}
