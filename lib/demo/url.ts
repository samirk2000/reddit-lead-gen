export const DEFAULT_PUBLIC_APP_URL = "https://reddit-lead-gen.vercel.app";

type HeaderSource = {
  get(name: string): string | null;
};

/**
 * Absolute origin for links sent on WhatsApp.
 * `NEXT_PUBLIC_APP_URL` or `APP_URL`, then the request host, then production.
 */
export function resolvePublicAppUrl(headerSource?: HeaderSource | null): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (fromEnv) return normalizeOrigin(fromEnv);

  const hostHeader = headerSource?.get("x-forwarded-host") ?? headerSource?.get("host");
  const host = hostHeader?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!isSafeHost(host)) return DEFAULT_PUBLIC_APP_URL;

  const protoHeader = headerSource?.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    protoHeader === "http" || protoHeader === "https"
      ? protoHeader
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
  return `${proto}://${host}`;
}

function normalizeOrigin(value: string): string {
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProto).origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

function isSafeHost(host: string): boolean {
  return /^[a-z0-9.-]+(?::\d{1,5})?$/.test(host);
}
