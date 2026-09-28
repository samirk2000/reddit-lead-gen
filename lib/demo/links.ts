/**
 * Sample pages live on torioweb.com. This app only maps a giro to that URL.
 * Keys match `SectorCopy.demoSlug`.
 */
export const DEFAULT_DEMOS_BASE_URL = "https://torioweb.com/ejemplos";

const DEMO_PATH_BY_SLUG: Readonly<Record<string, string>> = {
  dentista: "dentista",
};

export function demosBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DEMOS_BASE_URL?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DEMOS_BASE_URL;
  return base.replace(/\/+$/, "");
}

export function isKnownDemoSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEMO_PATH_BY_SLUG, slug);
}

/** Absolute sample URL, or null when this giro has no external page. */
export function externalDemoUrl(slug: string, businessName: string): string | null {
  const path = DEMO_PATH_BY_SLUG[slug];
  if (!path) return null;
  const page = `${demosBaseUrl()}/${path}`;
  const name = businessName.trim();
  if (!name) return page;
  return `${page}?nombre=${encodeURIComponent(name)}`;
}
