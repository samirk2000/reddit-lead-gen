const MAX_NAME_LENGTH = 80;

/**
 * Prospect name from `?nombre=`, safe to render as text.
 * Strips tags and characters that are not part of a business name.
 */
export function sanitizeBusinessName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^\p{L}\p{N}\s.'’&+,.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (cleaned.length < 2) return null;
  return cleaned;
}
