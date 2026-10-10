import { normalizeSectorKey } from "@/lib/maps/sectors";

/** Shown in the city picker until the operator chooses another place. */
export const DEFAULT_MAPS_CITY = "Querétaro";

/** Select value that reveals a free-text city or state. */
export const CUSTOM_CITY_VALUE = "__otra__";

/** Select value that searches several large cities, one page each. */
export const TODO_MEXICO_VALUE = "__mexico__";

/**
 * Largest / higher-income metros for "Todo México".
 * One search takes {@link TODO_MEXICO_CITIES_PER_SEARCH} of these, one page
 * each, so it stays inside the 3-page Places cap. The next search starts
 * further down the list.
 */
export const TODO_MEXICO_CITIES = [
  "Ciudad de México",
  "Monterrey",
  "Guadalajara",
  "Querétaro",
  "Puebla",
  "León",
  "Mérida",
  "Tijuana",
  "San Luis Potosí",
  "Aguascalientes",
  "Cancún",
  "Chihuahua",
] as const;

/** Cities hit by one nationwide search. 1 page each, so this is also the page cap. */
export const TODO_MEXICO_CITIES_PER_SEARCH = 3;

export function isTodoMexico(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === TODO_MEXICO_VALUE) return true;
  return normalizeSectorKey(trimmed) === "todo mexico";
}

/**
 * Next window of metros. `searchCount` is how many searches this user has
 * already logged, so each new search moves three cities ahead without a
 * new table.
 */
export function todoMexicoSearchCities(searchCount: number): string[] {
  const length = TODO_MEXICO_CITIES.length;
  const take = Math.min(TODO_MEXICO_CITIES_PER_SEARCH, length);
  if (take <= 0) return [];
  const start = positiveMod(searchCount * take, length);
  const cities: string[] = [];
  for (let index = 0; index < take; index += 1) {
    const city = TODO_MEXICO_CITIES[(start + index) % length];
    if (city) cities.push(city);
  }
  return cities;
}

function positiveMod(value: number, length: number): number {
  if (length <= 0) return 0;
  const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((safe % length) + length) % length;
}

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
  cdmx: "Ciudad de México",
  df: "Ciudad de México",
  "distrito federal": "Ciudad de México",
  "mexico city": "Ciudad de México",
};

/**
 * Official municipality names Google Places returns, keyed already
 * accent-stripped, mapped to the name people actually say.
 * Suburbs stay as themselves: Guadalupe and Zapopan are not here.
 */
const OFFICIAL_CITY_NAMES: Readonly<Record<string, string>> = {
  "heroica puebla de zaragoza": "Puebla",
  "puebla de zaragoza": "Puebla",
  "santiago de queretaro": "Querétaro",
  "heroica veracruz": "Veracruz",
  "victoria de durango": "Durango",
  "heroica matamoros": "Matamoros",
  "leon de los aldama": "León",
  "oaxaca de juarez": "Oaxaca",
  "toluca de lerdo": "Toluca",
  "culiacan rosales": "Culiacán",
  "san francisco de campeche": "Campeche",
  "acapulco de juarez": "Acapulco",
  "ecatepec de morelos": "Ecatepec",
  "tlalnepantla de baz": "Tlalnepantla",
  "naucalpan de juarez": "Naucalpan",
  "coacalco de berriozabal": "Coacalco",
  "cuajimalpa de morelos": "Cuajimalpa",
  "chalco de diaz covarrubias": "Chalco",
  "san pedro tlaquepaque": "Tlaquepaque",
};

for (const [alias, canonical] of Object.entries({
  ...EXTRA_CITY_ALIASES,
  ...OFFICIAL_CITY_NAMES,
})) {
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

const MAX_CITY_STRIP_DEPTH = 3;

/**
 * Name to show and search. Official ceremonial names become the short city
 * ("Heroica Puebla de Zaragoza" → "Puebla"). "Ciudad de México" stays.
 * A leading "Heroica" is honorary and drops. "Ciudad de …" drops only when
 * the rest is already a known city, so "Ciudad de Allende" and
 * "Ciudad del Carmen" stay. Guadalupe and Zapopan stay.
 */
export function commonCityName(input: string, depth = 0): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const key = normalizeSectorKey(trimmed);
  if (!key) return trimmed;

  const known = CITY_CANONICAL.get(key);
  if (known) return known;
  if (depth >= MAX_CITY_STRIP_DEPTH) return trimmed;

  const heroicaCiudad = trimmed.match(/^heroica\s+ciudad\s+de\s+(.+)$/i);
  if (heroicaCiudad?.[1]) {
    if (normalizeSectorKey(heroicaCiudad[1]) === "mexico") return "Ciudad de México";
    return commonCityName(heroicaCiudad[1], depth + 1);
  }

  const heroica = trimmed.match(/^heroica\s+(.+)$/i);
  if (heroica?.[1] && heroica[1].trim().length >= 2) {
    return commonCityName(heroica[1], depth + 1);
  }

  const ciudadDe = trimmed.match(/^ciudad\s+de\s+(.+)$/i);
  if (ciudadDe?.[1]) {
    const remainderKey = normalizeSectorKey(ciudadDe[1]);
    if (remainderKey && remainderKey !== "mexico" && CITY_CANONICAL.has(remainderKey)) {
      return commonCityName(ciudadDe[1], depth + 1);
    }
  }

  return trimmed;
}

/** Preset, official name, or the typed text when it is not a known alias. */
export function canonicalCityQuery(input: string): string {
  return commonCityName(input);
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
    return commonCityName(stripped);
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
  const fallback = commonCityName(searchedCity);
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
