import { normalizeSectorKey } from "@/lib/maps/sectors";

/** Shown in the city picker until the operator chooses another place. */
export const DEFAULT_MAPS_CITY = "Querétaro";

/** Select value that reveals a free-text city or state. */
export const CUSTOM_CITY_VALUE = "__otra__";

/**
 * Large Mexican cities. `query` is what we send to Places and, when the
 * address does not name a finer city, what the WhatsApp copy uses.
 */
export const MEXICO_CITY_PRESETS = [
  { label: "Querétaro", query: "Querétaro" },
  { label: "CDMX", query: "Ciudad de México" },
  { label: "Guadalajara", query: "Guadalajara" },
  { label: "Monterrey", query: "Monterrey" },
  { label: "Puebla", query: "Puebla" },
  { label: "León", query: "León" },
  { label: "Mérida", query: "Mérida" },
  { label: "Tijuana", query: "Tijuana" },
  { label: "San Luis Potosí", query: "San Luis Potosí" },
  { label: "Aguascalientes", query: "Aguascalientes" },
  { label: "Cancún", query: "Cancún" },
  { label: "Toluca", query: "Toluca" },
  { label: "Chihuahua", query: "Chihuahua" },
  { label: "Hermosillo", query: "Hermosillo" },
  { label: "Morelia", query: "Morelia" },
  { label: "Saltillo", query: "Saltillo" },
  { label: "Culiacán", query: "Culiacán" },
  { label: "Veracruz", query: "Veracruz" },
  { label: "Mexicali", query: "Mexicali" },
  { label: "Torreón", query: "Torreón" },
  { label: "Cuernavaca", query: "Cuernavaca" },
  { label: "Villahermosa", query: "Villahermosa" },
  { label: "Oaxaca", query: "Oaxaca" },
  { label: "Tampico", query: "Tampico" },
] as const;

const CITY_CANONICAL = new Map<string, string>();

for (const preset of MEXICO_CITY_PRESETS) {
  CITY_CANONICAL.set(normalizeSectorKey(preset.label), preset.query);
  CITY_CANONICAL.set(normalizeSectorKey(preset.query), preset.query);
}

const EXTRA_CITY_ALIASES: Readonly<Record<string, string>> = {
  "santiago de queretaro": "Querétaro",
  cdmx: "Ciudad de México",
  df: "Ciudad de México",
  "distrito federal": "Ciudad de México",
  "mexico city": "Ciudad de México",
};

for (const [alias, canonical] of Object.entries(EXTRA_CITY_ALIASES)) {
  CITY_CANONICAL.set(alias, canonical);
}

const STATE_CODES = new Set([
  "qro",
  "nl",
  "jal",
  "bc",
  "bcs",
  "chih",
  "son",
  "mich",
  "coah",
  "sin",
  "ver",
  "yuc",
  "qr",
  "qroo",
  "mor",
  "pue",
  "gto",
  "ags",
  "slp",
  "mex",
  "edomex",
  "dgo",
  "nay",
  "col",
  "gro",
  "oax",
  "chis",
  "tab",
  "camp",
  "tamps",
  "tam",
  "zac",
  "hgo",
  "tlax",
  "cdmx",
  "df",
]);

const STATE_NAMES = new Set([
  "nuevo leon",
  "jalisco",
  "baja california",
  "baja california sur",
  "chihuahua",
  "sonora",
  "michoacan",
  "coahuila",
  "sinaloa",
  "veracruz",
  "yucatan",
  "quintana roo",
  "morelos",
  "puebla",
  "guanajuato",
  "aguascalientes",
  "san luis potosi",
  "estado de mexico",
  "durango",
  "nayarit",
  "colima",
  "guerrero",
  "oaxaca",
  "chiapas",
  "tabasco",
  "campeche",
  "tamaulipas",
  "zacatecas",
  "hidalgo",
  "tlaxcala",
  "distrito federal",
]);

/** Preset label/query, or the typed text when it is not a known alias. */
export function canonicalCityQuery(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return CITY_CANONICAL.get(normalizeSectorKey(trimmed)) ?? trimmed;
}

/**
 * City named in a Mexican formatted address, or null when it cannot be read.
 * Known cities win over the state abbreviation that follows them.
 */
export function extractMexicanCity(address: string): string | null {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || isSkippable(part)) continue;
    const known = lookupCity(stripPostalPrefix(part));
    if (known) return known;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || isSkippable(part) || isMexicanState(part)) continue;
    const stripped = stripPostalPrefix(part);
    if (!stripped || isMexicanState(stripped) || isSkippable(stripped)) continue;
    return stripped;
  }

  return null;
}

/**
 * City for the WhatsApp copy. The address wins when it names one;
 * otherwise the city the operator searched. Never invents a city.
 */
export function resolveBusinessCity(
  address: string | null | undefined,
  searchedCity: string,
): string {
  const fallback = searchedCity.trim().replace(/\s+/g, " ");
  const parsed = address?.trim() ? extractMexicanCity(address) : null;
  return parsed || fallback;
}

function lookupCity(value: string): string | null {
  const key = normalizeSectorKey(value);
  if (!key) return null;
  return CITY_CANONICAL.get(key) ?? null;
}

function isSkippable(part: string): boolean {
  return isCountry(part) || isPostalOnly(part);
}

function isCountry(part: string): boolean {
  return normalizeSectorKey(part) === "mexico";
}

function isPostalOnly(part: string): boolean {
  return /^(?:c\.?\s*p\.?\s*)?\d{5}$/i.test(part.trim());
}

function stripPostalPrefix(part: string): string {
  return part.replace(/^(?:c\.?\s*p\.?\s*)?\d{5}\s+/i, "").trim();
}

function isMexicanState(part: string): boolean {
  const spaced = normalizeSectorKey(part);
  if (!spaced) return false;
  // Puebla, Veracruz and Chihuahua are both a city and a state.
  // When the part is exactly that name, keep it as the city.
  if (CITY_CANONICAL.has(spaced)) return false;
  if (STATE_NAMES.has(spaced)) return true;
  return STATE_CODES.has(spaced.replace(/\s+/g, ""));
}
