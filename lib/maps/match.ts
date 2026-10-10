import { normalizeSectorKey, resolveSector } from "@/lib/maps/sectors";

/**
 * Place types that mean the result is food or retail, not the professional
 * we searched. A type is only a mismatch when this giro did not expect it.
 */
const OFF_GIRO_TYPES = new Set([
  "restaurant",
  "food",
  "meal_takeaway",
  "meal_delivery",
  "bar",
  "cafe",
  "bakery",
  "night_club",
  "liquor_store",
  "supermarket",
  "grocery_store",
  "convenience_store",
  "clothing_store",
  "shoe_store",
  "department_store",
  "electronics_store",
  "pet_store",
  "hardware_store",
  "furniture_store",
  "home_goods_store",
  "store",
]);

const FOOD_GIROS = new Set([
  "restaurante",
  "cafeteria",
  "cafe",
  "bar",
  "taqueria",
  "pizzeria",
  "fonda",
  "mariscos",
  "cantina",
]);

/** Google Places types that fit the giro. Unknown giros rely on the name list. */
const EXPECTED_TYPES: Readonly<Record<string, readonly string[]>> = {
  abogado: ["lawyer"],
  "clinica estetica": ["doctor", "spa", "beauty_salon", "skin_care_clinic"],
  "medico estetico": ["doctor", "spa", "beauty_salon", "skin_care_clinic"],
  "salon de eventos": ["event_venue", "banquet_hall", "wedding_venue"],
  constructora: ["general_contractor"],
  "cocinas integrales": ["furniture_store", "home_goods_store", "general_contractor"],
  "cocina integral": ["furniture_store", "home_goods_store", "general_contractor"],
  notaria: ["lawyer"],
  contador: ["accounting"],
  "despacho contable": ["accounting"],
  arquitecto: ["general_contractor"],
  inmobiliaria: ["real_estate_agency"],
  dentista: ["dentist"],
  odontologo: ["dentist"],
  ortodoncista: ["dentist"],
  dermatologo: ["doctor", "skin_care_clinic"],
  "cirujano plastico": ["doctor"],
  veterinario: ["veterinary_care"],
  oftalmologo: ["doctor"],
  nutriologo: ["doctor"],
  fisioterapeuta: ["physiotherapist", "doctor"],
  psicologo: ["doctor"],
  colegio: ["school", "primary_school", "secondary_school", "university"],
  escuela: ["school", "primary_school", "secondary_school", "university"],
};

/**
 * Strong signs the name is a food or grocery business. "bar" is a whole word,
 * so "barbería" stays. "cocina" alone stays, so cocinas integrales stay.
 */
const MISMATCH_NAME_PHRASES = [
  "cocina economica",
  "taqueria",
  "taquerias",
  "tacos",
  "taco",
  "restaurante",
  "restaurant",
  "pizzeria",
  "cantina",
  "marisqueria",
  "mariscos",
  "abarrotes",
  "antojitos",
  "hamburguesas",
  "hamburguesa",
  "cerveceria",
  "polleria",
  "rosticeria",
  "torteria",
  "loncheria",
  "cenaduria",
  "neveria",
  "jugueria",
  "panaderia",
  "fonda",
  "sushi",
  "bar",
] as const;

const EMPTY_TYPES = new Set<string>();

export type GiroMatchInput = {
  name: string;
  specialty: string;
  primaryType?: string | null;
  types?: readonly string[] | null;
};

/**
 * True when Places clearly returned another kind of business, such as a
 * taquería for "abogado". Food giros are left alone. A matching primary type
 * wins over the name.
 */
export function isGiroMismatch(input: GiroMatchInput): boolean {
  if (isFoodGiro(input.specialty)) return false;

  const primary = input.primaryType?.trim().toLowerCase() ?? "";
  const expected = expectedTypesFor(input.specialty);
  if (primary && expected.has(primary)) return false;
  if (primary && OFF_GIRO_TYPES.has(primary)) return true;

  if (!primary) {
    const listed = listedTypes(input.types);
    const hasExpected = [...listed].some((type) => expected.has(type));
    const hasOff = [...listed].some((type) => OFF_GIRO_TYPES.has(type));
    if (hasOff && !hasExpected) return true;
  }

  return nameHasMismatch(input.name);
}

export function nameHasMismatch(name: string): boolean {
  const normalized = normalizeSectorKey(name);
  if (!normalized) return false;
  return MISMATCH_NAME_PHRASES.some((phrase) => hasPhrase(normalized, phrase));
}

function isFoodGiro(specialty: string): boolean {
  const key = normalizeSectorKey(specialty);
  if (FOOD_GIROS.has(key)) return true;
  return FOOD_GIROS.has(normalizeSectorKey(resolveSector(specialty).busqueda));
}

function expectedTypesFor(specialty: string): ReadonlySet<string> {
  const key = normalizeSectorKey(specialty);
  const direct = EXPECTED_TYPES[key];
  if (direct) return new Set(direct);
  const byBusqueda = EXPECTED_TYPES[normalizeSectorKey(resolveSector(specialty).busqueda)];
  if (byBusqueda) return new Set(byBusqueda);
  return EMPTY_TYPES;
}

function listedTypes(types: readonly string[] | null | undefined): Set<string> {
  const listed = new Set<string>();
  for (const type of types ?? []) {
    const value = type.trim().toLowerCase();
    if (value) listed.add(value);
  }
  return listed;
}

function hasPhrase(normalizedName: string, phrase: string): boolean {
  const pattern = new RegExp(`(?:^|\\s)${phrase}(?:$|\\s)`);
  return pattern.test(normalizedName);
}
