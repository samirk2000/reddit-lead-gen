import { timingSafeEqual } from "node:crypto";

/**
 * True when `Authorization` is `Bearer <expected>`.
 * Empty expected secrets never match, including an empty bearer token.
 */
export function bearerTokenMatches(
  authorization: string | null,
  expected: string,
): boolean {
  if (!expected) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length).trim();
  const got = Buffer.from(token);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || got.length === 0) return false;
  return timingSafeEqual(got, exp);
}
