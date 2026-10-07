/**
 * Outreach copy by giro.
 *
 * `maps_leads.specialty` is the search keyword the operator typed (see
 * `SPECIALTY_PRESETS` and `searchMapsLeads`), not a Google Places type.
 * Keys are matched without accents, case, or a trailing Spanish plural.
 */

export type SectorCopy = {
  /** Who looks for this business, e.g. "pacientes". */
  clientes: string;
  /** What people type into Google, without the city. */
  busqueda: string;
  /** Verb phrase after "antes de". */
  accion: string;
  /** Place shown in the photos, e.g. "consultorio". */
  lugar: string;
  /** Short action for the WhatsApp button. */
  accionCorta: string;
  /** Local-SEO article title. May include `{{ciudad}}`. */
  ejemploBlog: string;
  /** Key into the external sample-page map, when this giro has one. */
  demoSlug?: string;
  /**
   * 0–100 ticket score from the Mexico market study.
   * Higher means the giro is a better fit for a page from $8,000 MXN.
   */
  marketScore: number;
};

type SectorKey = string | { key: string; busqueda: string; exactOnly?: boolean };

const SECTORS = new Map<string, SectorCopy>();
/** Short or ambiguous keys match only the whole specialty, not a longer phrase. */
const EXACT_ONLY = new Set<string>();

function add(copy: SectorCopy, keys: readonly SectorKey[]): void {
  for (const entry of keys) {
    const rawKey = typeof entry === "string" ? entry : entry.key;
    const busqueda = typeof entry === "string" ? copy.busqueda : entry.busqueda;
    const exactOnly = typeof entry === "string" ? false : entry.exactOnly === true;
    const normalized = normalizeSectorKey(rawKey);
    if (!normalized) {
      throw new Error("Llave de giro vacía.");
    }
    if (SECTORS.has(normalized)) {
      throw new Error(`Giro duplicado: ${normalized}`);
    }
    SECTORS.set(normalized, { ...copy, busqueda });
    if (exactOnly) EXACT_ONLY.add(normalized);
  }
}

add(
  {
    clientes: "pacientes",
    busqueda: "dentista",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un blanqueamiento en {{ciudad}}?",
    demoSlug: "dentista",
    marketScore: 89,
  },
  [
    "dentista",
    { key: "odontólogo", busqueda: "odontólogo" },
    { key: "odontóloga", busqueda: "odontóloga" },
    { key: "odontología", busqueda: "odontología" },
    { key: "clínica dental", busqueda: "clínica dental" },
    { key: "consultorio dental", busqueda: "consultorio dental" },
    { key: "implantes dentales", busqueda: "implantes dentales" },
    { key: "implante dental", busqueda: "implantes dentales" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "ortodoncista",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuestan los brackets en {{ciudad}}?",
    demoSlug: "dentista",
    marketScore: 89,
  },
  ["ortodoncista", { key: "ortodoncia", busqueda: "ortodoncia" }],
);

add(
  {
    clientes: "pacientes",
    busqueda: "dermatólogo",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un tratamiento para el acné en {{ciudad}}?",
    marketScore: 76,
  },
  [
    "dermatólogo",
    { key: "dermatóloga", busqueda: "dermatóloga" },
    { key: "dermatología", busqueda: "dermatología" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "médico estético",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog:
      "¿Cuánto cuesta un tratamiento de rejuvenecimiento facial en {{ciudad}}?",
    demoSlug: "clinica-estetica",
    marketScore: 83,
  },
  [
    "médico estético",
    { key: "médica estética", busqueda: "médica estética" },
    { key: "medicina estética", busqueda: "medicina estética" },
    { key: "clínica estética", busqueda: "clínica estética" },
    { key: "spa médico", busqueda: "spa médico" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "médico",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta una consulta médica en {{ciudad}}?",
    marketScore: 50,
  },
  [
    "médico",
    { key: "médica", busqueda: "médica" },
    { key: "médico general", busqueda: "médico general" },
    { key: "doctor", busqueda: "doctor" },
    { key: "doctora", busqueda: "doctora" },
    { key: "clínica", busqueda: "clínica" },
    { key: "clínica general", busqueda: "clínica general" },
    { key: "consultorio médico", busqueda: "médico" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "cirujano plástico",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta una rinoplastia en {{ciudad}}?",
    demoSlug: "clinica-estetica",
    marketScore: 81,
  },
  [
    "cirujano plástico",
    { key: "cirujana plástica", busqueda: "cirujana plástica" },
    { key: "cirugía plástica", busqueda: "cirugía plástica" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "oftalmólogo",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un examen de la vista en {{ciudad}}?",
    marketScore: 74,
  },
  ["oftalmólogo", { key: "oftalmóloga", busqueda: "oftalmóloga" }],
);

add(
  {
    clientes: "pacientes",
    busqueda: "fisioterapeuta",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta una sesión de fisioterapia en {{ciudad}}?",
    marketScore: 64,
  },
  ["fisioterapeuta", { key: "fisioterapia", busqueda: "fisioterapia" }],
);

add(
  {
    clientes: "pacientes",
    busqueda: "psicólogo",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta una sesión con un psicólogo en {{ciudad}}?",
    marketScore: 58,
  },
  [
    "psicólogo",
    { key: "psicóloga", busqueda: "psicóloga" },
    { key: "psicología", busqueda: "psicología" },
  ],
);

add(
  {
    clientes: "pacientes",
    busqueda: "nutriólogo",
    accion: "agendar",
    lugar: "consultorio",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta una consulta de nutrición en {{ciudad}}?",
    marketScore: 60,
  },
  [
    "nutriólogo",
    { key: "nutrióloga", busqueda: "nutrióloga" },
    { key: "nutricionista", busqueda: "nutricionista" },
  ],
);

add(
  {
    clientes: "dueños de mascotas",
    busqueda: "veterinario",
    accion: "agendar",
    lugar: "clínica",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta vacunar a un perro en {{ciudad}}?",
    marketScore: 68,
  },
  [
    "veterinario",
    { key: "veterinaria", busqueda: "veterinaria" },
    { key: "vet", busqueda: "veterinario" },
    { key: "clínica veterinaria", busqueda: "veterinario" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "abogado",
    accion: "consultar",
    lugar: "despacho",
    accionCorta: "consultar",
    ejemploBlog: "¿Cuánto cobra un abogado por un divorcio en {{ciudad}}?",
    demoSlug: "abogado",
    marketScore: 86,
  },
  [
    "abogado",
    { key: "abogada", busqueda: "abogada" },
    { key: "despacho jurídico", busqueda: "abogado" },
    { key: "bufete", busqueda: "bufete" },
    { key: "bufete jurídico", busqueda: "bufete jurídico" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "contador",
    accion: "contratar",
    lugar: "despacho",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cobra un contador por la declaración anual en {{ciudad}}?",
    marketScore: 52,
  },
  [
    "contador",
    { key: "contadora", busqueda: "contadora" },
    { key: "contador público", busqueda: "contador" },
  ],
);

add(
  {
    clientes: "comensales",
    busqueda: "restaurante",
    accion: "reservar",
    lugar: "local",
    accionCorta: "reservar",
    ejemploBlog: "¿Dónde comer en familia en {{ciudad}}?",
    marketScore: 18,
  },
  ["restaurante", { key: "restaurant", busqueda: "restaurante" }],
);

add(
  {
    clientes: "clientes",
    busqueda: "cafetería",
    accion: "visitar",
    lugar: "local",
    accionCorta: "ordenar",
    ejemploBlog: "¿Dónde encontrar una buena cafetería en {{ciudad}}?",
    marketScore: 20,
  },
  ["cafetería", { key: "café", busqueda: "cafetería" }],
);

add(
  {
    clientes: "clientes",
    busqueda: "salón de belleza",
    accion: "agendar",
    lugar: "salón",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un corte y color en {{ciudad}}?",
    marketScore: 36,
  },
  [
    "salón de belleza",
    { key: "salón", busqueda: "salón de belleza", exactOnly: true },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "estética",
    accion: "agendar",
    lugar: "centro",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un facial en {{ciudad}}?",
    marketScore: 40,
  },
  [
    "estética",
    { key: "centro de estética", busqueda: "estética" },
    { key: "centro estético", busqueda: "centro estético" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "barbería",
    accion: "agendar",
    lugar: "barbería",
    accionCorta: "agendar",
    ejemploBlog: "¿Cuánto cuesta un corte y barba en {{ciudad}}?",
    marketScore: 16,
  },
  ["barbería", { key: "barbero", busqueda: "barbería" }],
);

add(
  {
    clientes: "clientes",
    busqueda: "gimnasio",
    accion: "inscribirse",
    lugar: "gimnasio",
    accionCorta: "inscribirse",
    ejemploBlog: "¿Cuánto cuesta la mensualidad de un gimnasio en {{ciudad}}?",
    marketScore: 38,
  },
  ["gimnasio", { key: "gym", busqueda: "gimnasio" }],
);

add(
  {
    clientes: "clientes",
    busqueda: "spa",
    accion: "reservar",
    lugar: "spa",
    accionCorta: "reservar",
    ejemploBlog: "¿Cuánto cuesta un masaje en {{ciudad}}?",
    marketScore: 42,
  },
  ["spa"],
);

add(
  {
    clientes: "clientes",
    busqueda: "taller mecánico",
    accion: "llevar el auto",
    lugar: "taller",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta un servicio de frenos en {{ciudad}}?",
    marketScore: 48,
  },
  [
    "taller mecánico",
    { key: "mecánico", busqueda: "mecánico" },
    { key: "mecánica automotriz", busqueda: "taller mecánico" },
    { key: "taller", busqueda: "taller mecánico", exactOnly: true },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "carpintería",
    accion: "contratar",
    lugar: "taller",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta una cocina integral en {{ciudad}}?",
    demoSlug: "cocinas",
    marketScore: 85,
  },
  [
    "carpintería",
    { key: "carpintero", busqueda: "carpintero" },
    { key: "cocina integral", busqueda: "cocinas integrales" },
    { key: "cocinas", busqueda: "cocinas", exactOnly: true },
    { key: "mueble a medida", busqueda: "muebles a medida" },
    { key: "closet", busqueda: "closets" },
    { key: "closets", busqueda: "closets" },
    { key: "mueblería", busqueda: "mueblería" },
    { key: "tienda de mueble", busqueda: "tienda de muebles" },
  ],
);

add(
  {
    clientes: "personas",
    busqueda: "inmobiliaria",
    accion: "comprar o rentar",
    lugar: "oficina",
    accionCorta: "agendar una visita",
    ejemploBlog: "¿Cuánto cuesta rentar un departamento en {{ciudad}}?",
    marketScore: 70,
  },
  ["inmobiliaria", { key: "bienes raíces", busqueda: "inmobiliaria" }],
);

add(
  {
    clientes: "padres de familia",
    busqueda: "escuela",
    accion: "elegir",
    lugar: "plantel",
    accionCorta: "pedir informes",
    ejemploBlog: "¿Cuánto cuesta la colegiatura de una escuela en {{ciudad}}?",
    marketScore: 44,
  },
  ["escuela"],
);

add(
  {
    clientes: "padres de familia",
    busqueda: "colegio",
    accion: "elegir",
    lugar: "plantel",
    accionCorta: "pedir informes",
    ejemploBlog: "¿Cómo elegir colegio en {{ciudad}}?",
    marketScore: 46,
  },
  ["colegio"],
);

add(
  {
    clientes: "clientes",
    busqueda: "fotógrafo",
    accion: "contratar",
    lugar: "estudio",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta un fotógrafo para una boda en {{ciudad}}?",
    marketScore: 46,
  },
  [
    "fotógrafo",
    { key: "fotógrafa", busqueda: "fotógrafa" },
    { key: "fotografía", busqueda: "fotógrafo" },
    { key: "estudio fotográfico", busqueda: "fotógrafo" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "constructora",
    accion: "contratar",
    lugar: "obra",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta construir una casa en {{ciudad}}?",
    demoSlug: "constructora",
    marketScore: 83,
  },
  [
    "constructora",
    { key: "constructoras", busqueda: "constructora" },
    { key: "empresa constructora", busqueda: "constructora" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "arquitecto",
    accion: "contratar",
    lugar: "despacho",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta un proyecto arquitectónico en {{ciudad}}?",
    demoSlug: "constructora",
    marketScore: 83,
  },
  [
    "arquitecto",
    { key: "arquitecta", busqueda: "arquitecta" },
    { key: "despacho de arquitectura", busqueda: "despacho de arquitectura" },
    { key: "arquitectura", busqueda: "arquitecto" },
  ],
);

add(
  {
    clientes: "clientes",
    busqueda: "remodelaciones",
    accion: "contratar",
    lugar: "obra",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta una remodelación integral en {{ciudad}}?",
    demoSlug: "constructora",
    marketScore: 83,
  },
  [
    "remodelaciones",
    { key: "remodelación", busqueda: "remodelación" },
    { key: "remodeladora", busqueda: "remodelaciones" },
  ],
);

add(
  {
    clientes: "familias",
    busqueda: "salón de eventos",
    accion: "reservar",
    lugar: "salón",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta rentar un salón de eventos en {{ciudad}}?",
    demoSlug: "salon-eventos",
    marketScore: 83,
  },
  [
    "salón de eventos",
    { key: "salones de eventos", busqueda: "salón de eventos" },
    { key: "salón de fiestas", busqueda: "salón de fiestas" },
    { key: "salones de fiestas", busqueda: "salón de fiestas" },
  ],
);

add(
  {
    clientes: "familias",
    busqueda: "jardín de eventos",
    accion: "reservar",
    lugar: "jardín",
    accionCorta: "cotizar",
    ejemploBlog: "¿Cuánto cuesta rentar un jardín de eventos en {{ciudad}}?",
    demoSlug: "salon-eventos",
    marketScore: 83,
  },
  [
    "jardín de eventos",
    { key: "jardines de eventos", busqueda: "jardín de eventos" },
    { key: "quinta", busqueda: "quinta para eventos", exactOnly: true },
  ],
);

export function knownSectorKeys(): readonly string[] {
  return [...SECTORS.keys()];
}

/** Ticket score for the giro people searched, 0–100. Notarías stay at the bottom. */
export function marketScoreForSpecialty(specialty: string): number {
  const normalized = normalizeSectorKey(specialty);
  if (/(^|\s)notari/.test(normalized)) return 12;
  return resolveSector(specialty).marketScore;
}

export function normalizeSectorKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Copy for a specialty, or a generic fallback that quotes the typed giro. */
export function resolveSector(specialty: string): SectorCopy {
  const normalized = normalizeSectorKey(specialty);
  if (!normalized) return genericSector(specialty);

  const exact = SECTORS.get(normalized);
  if (exact) return exact;

  const singular = singularizePhrase(normalized);
  if (singular !== normalized) {
    const pluralHit = SECTORS.get(singular);
    if (pluralHit) return pluralHit;
  }

  // "muebles" / "bufetes" are -e stems. The -es chop turns them into "muebl" / "bufet".
  const eStem = eStemSingularPhrase(normalized);
  if (eStem !== normalized && eStem !== singular) {
    const eStemHit = SECTORS.get(eStem);
    if (eStemHit) return eStemHit;
  }

  const contained =
    longestContained(normalized) ??
    (singular !== normalized ? longestContained(singular) : undefined) ??
    (eStem !== normalized && eStem !== singular ? longestContained(eStem) : undefined);
  if (contained) return contained;

  return genericSector(specialty);
}

export function applyCity(template: string, city: string): string {
  const trimmed = city.trim();
  if (!trimmed) {
    return template
      .replace(/\s+en\s+\{\{\s*ciudad\s*\}\}/gi, "")
      .replace(/\{\{\s*ciudad\s*\}\}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return template.replace(/\{\{\s*ciudad\s*\}\}/gi, trimmed);
}

function genericSector(specialty: string): SectorCopy {
  const giro = displayGiro(specialty);
  return {
    clientes: "clientes",
    busqueda: giro,
    accion: "contactar",
    lugar: "negocio",
    accionCorta: "contactar",
    ejemploBlog: `5 cosas que debe saber antes de contratar ${articleFor(giro)} ${giro} en {{ciudad}}`,
    marketScore: 30,
  };
}

function displayGiro(specialty: string): string {
  const cleaned = specialty
    .replace(/["“”«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "negocio";
}

/** "un" / "una" for the generic article title. Common-gender -ista stays "un". */
function articleFor(giro: string): "un" | "una" {
  const first = giro.split(" ")[0] ?? "";
  const bare = normalizeSectorKey(first);
  if (!bare || bare.endsWith("ista")) return "un";
  if (bare.endsWith("a")) return "una";
  return "un";
}

function longestContained(phrase: string): SectorCopy | undefined {
  let bestKey = "";
  let best: SectorCopy | undefined;
  for (const [key, copy] of SECTORS) {
    if (EXACT_ONLY.has(key)) continue;
    if (key.length <= bestKey.length) continue;
    if (!containsWordPhrase(phrase, key)) continue;
    bestKey = key;
    best = copy;
  }
  return best;
}

function containsWordPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  let from = 0;
  while (from <= haystack.length - phrase.length) {
    const index = haystack.indexOf(phrase, from);
    if (index === -1) return false;
    const beforeOk = index === 0 || haystack[index - 1] === " ";
    const afterIndex = index + phrase.length;
    const afterOk = afterIndex === haystack.length || haystack[afterIndex] === " ";
    if (beforeOk && afterOk) return true;
    from = index + 1;
  }
  return false;
}

function singularizePhrase(phrase: string): string {
  return phrase.split(" ").map(singularizeWord).join(" ");
}

/**
 * Singular for a stem that already ends in "e" (mueble, bufete).
 * Words the -es rule already singularizes correctly (taller, integral) stay
 * on `singularizeWord`; this is only the fallback.
 */
function eStemSingularPhrase(phrase: string): string {
  return phrase.split(" ").map(eStemSingularWord).join(" ");
}

function eStemSingularWord(word: string): string {
  const primary = singularizeWord(word);
  if (word.length > 4 && word.endsWith("es") && primary === word.slice(0, -2)) {
    return word.slice(0, -1);
  }
  return primary;
}

function singularizeWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ces") && word.length > 4) {
    return `${word.slice(0, -3)}z`;
  }
  if (word.endsWith("es") && word.length > 4) {
    const before = word[word.length - 3];
    if (before && !"aeiou".includes(before)) return word.slice(0, -2);
  }
  if (word.endsWith("s")) {
    const before = word[word.length - 2];
    if (before && "aeiou".includes(before)) return word.slice(0, -1);
  }
  return word;
}
