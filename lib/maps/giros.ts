import { isKnownDemoSlug } from "@/lib/demo/links";
import { normalizeSectorKey, resolveSector } from "@/lib/maps/sectors";

export type GiroTier = "alta" | "media";

export type GiroChip = {
  query: string;
  tier: GiroTier;
};

/**
 * Chips in buy-likelihood order. Top tier is what we search first and what
 * the daily list rotates. The query is also the free-text value.
 * Notarías stay out of both tiers so the digest and drip never rotate them.
 */
export const GIRO_CHIPS: readonly GiroChip[] = [
  { query: "abogado", tier: "alta" },
  { query: "dentista", tier: "alta" },
  { query: "ortodoncista", tier: "alta" },
  { query: "clínica estética", tier: "alta" },
  { query: "médico estético", tier: "alta" },
  { query: "cirujano plástico", tier: "alta" },
  { query: "dermatólogo", tier: "alta" },
  { query: "oftalmólogo", tier: "alta" },
  { query: "arquitecto", tier: "alta" },
  { query: "constructora", tier: "alta" },
  { query: "cocinas integrales", tier: "alta" },
  { query: "salón de eventos", tier: "media" },
  { query: "inmobiliaria", tier: "media" },
  { query: "contador", tier: "media" },
  { query: "fertilidad", tier: "media" },
  { query: "colegio", tier: "media" },
  { query: "nutriólogo", tier: "media" },
  { query: "fisioterapeuta", tier: "media" },
  { query: "veterinario", tier: "media" },
  { query: "psicólogo", tier: "media" },
];

/** First top-tier chip. The search form starts here. */
export const DEFAULT_GIRO = GIRO_CHIPS[0]?.query ?? "abogado";

export const TOP_TIER_GIROS: readonly string[] = GIRO_CHIPS.filter(
  (chip) => chip.tier === "alta",
).map((chip) => chip.query);

/** Static hint shown while a top-tier chip is selected. */
export const TOP_TIER_CITY_HINT = ["Monterrey", "Guadalajara", "CDMX"] as const;

/** True when this giro already has a page on torioweb.com. */
export function giroHasDemo(query: string): boolean {
  const slug = resolveSector(query).demoSlug;
  return typeof slug === "string" && slug.length > 0 && isKnownDemoSlug(slug);
}

export function cityHintForGiro(query: string): readonly string[] | null {
  const key = normalizeSectorKey(query);
  const chip = GIRO_CHIPS.find((item) => normalizeSectorKey(item.query) === key);
  if (!chip || chip.tier !== "alta") return null;
  return TOP_TIER_CITY_HINT;
}

/** Demo giros first, keeping the original order inside each group. */
export function demoFirstGiros(queries: readonly string[]): string[] {
  const withDemo: string[] = [];
  const rest: string[] = [];
  for (const query of queries) {
    if (giroHasDemo(query)) withDemo.push(query);
    else rest.push(query);
  }
  return [...withDemo, ...rest];
}

/**
 * Daily-list and drip rotation. Demos stay ahead of giros without a page,
 * then arquitecto moves to the front: they reply the most.
 */
export function rotationGiros(queries: readonly string[]): string[] {
  const ordered = demoFirstGiros(queries);
  const index = ordered.findIndex((query) => normalizeSectorKey(query) === "arquitecto");
  if (index <= 0) return ordered;
  const lead = ordered[index];
  if (!lead) return ordered;
  return [lead, ...ordered.filter((_, itemIndex) => itemIndex !== index)];
}
