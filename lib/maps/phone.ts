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
