import { isRedditPostUrl } from "./links";

/** Matches the bot row in sync_supabase.py (`to_row`). estado and notas are ignored. */
export const REDDIT_WEB_INGEST_BATCH_MAX = 100;

const ISSUE_LIMIT = 20;
const REDDIT_ID_RE = /^(?:t3_)?[A-Za-z0-9]{3,30}$/;
const SUBREDDIT_RE = /^[A-Za-z0-9_]{2,50}$/;

export type RedditWebIngestIdioma = "es-MX" | "en-US";

export type IngestIssue = {
  index: number;
  field: string;
  message: string;
};

/** Lead accepted by the ingest route. Content fields are always present. */
export type ValidRedditWebLead = {
  reddit_id: string;
  url: string;
  title: string;
  subreddit: string;
  author: string | null;
  created_utc: string | null;
  problema: string | null;
  pais_detectado: string | null;
  idioma: RedditWebIngestIdioma | null;
  score_intencion: number | null;
  intencion: string | null;
  clasificador: string | null;
  keywords: string[];
  borrador_es: string | null;
  borrador_en: string | null;
};

/**
 * Row written on ingest. estado and notas are omitted on purpose so Postgres
 * keeps the operator's values on conflict and applies column defaults on insert.
 */
export type RedditWebIngestRow = {
  user_id: string;
  reddit_id: string;
  url: string;
  title: string;
  subreddit: string;
  author: string | null;
  created_utc: string | null;
  problema: string | null;
  pais_detectado: string | null;
  idioma: RedditWebIngestIdioma | null;
  score_intencion: number | null;
  intencion: string | null;
  clasificador: string | null;
  keywords: string[];
  borrador_es: string | null;
  borrador_en: string | null;
};

export type ParsedIngest =
  | {
      ok: true;
      leads: ValidRedditWebLead[];
      received: number;
      deduped: number;
    }
  | {
      ok: false;
      error: string;
      issues: IngestIssue[];
    };

export function toIngestRow(
  userId: string,
  lead: ValidRedditWebLead,
): RedditWebIngestRow {
  return {
    user_id: userId,
    reddit_id: lead.reddit_id,
    url: lead.url,
    title: lead.title,
    subreddit: lead.subreddit,
    author: lead.author,
    created_utc: lead.created_utc,
    problema: lead.problema,
    pais_detectado: lead.pais_detectado,
    idioma: lead.idioma,
    score_intencion: lead.score_intencion,
    intencion: lead.intencion,
    clasificador: lead.clasificador,
    keywords: lead.keywords,
    borrador_es: lead.borrador_es,
    borrador_en: lead.borrador_en,
  };
}

export function parseIngestBody(body: unknown): ParsedIngest {
  if (isRecord(body) && "leads" in body && !Array.isArray(body)) {
    return {
      ok: false,
      error:
        "Envía un arreglo JSON en la raíz del cuerpo, no un objeto { leads: [...] }.",
      issues: [],
    };
  }

  if (!Array.isArray(body)) {
    return {
      ok: false,
      error: "El cuerpo debe ser un arreglo JSON de leads.",
      issues: [],
    };
  }

  if (body.length > REDDIT_WEB_INGEST_BATCH_MAX) {
    return {
      ok: false,
      error: `El lote acepta como máximo ${REDDIT_WEB_INGEST_BATCH_MAX} leads.`,
      issues: [],
    };
  }

  const issues: IngestIssue[] = [];
  let issueCount = 0;
  const push = (index: number, field: string, message: string) => {
    issueCount += 1;
    if (issues.length < ISSUE_LIMIT) issues.push({ index, field, message });
  };

  const valid: ValidRedditWebLead[] = [];

  body.forEach((item, index) => {
    const before = issueCount;
    if (!isRecord(item)) {
      push(index, "lead", "Cada elemento debe ser un objeto.");
      return;
    }

    const redditId = readRedditId(item.reddit_id, index, push);
    const url = readUrl(item.url, index, push);
    const title = readRequiredText(item.title, index, "title", 500, push);
    const subreddit = readSubreddit(item.subreddit, index, push);
    const author = readOptionalText(item.author, index, "author", 80, push);
    const createdUtc = readTimestamp(item.created_utc, index, push);
    const problema = readOptionalText(item.problema, index, "problema", 8000, push);
    const pais = readOptionalText(
      item.pais_detectado,
      index,
      "pais_detectado",
      80,
      push,
    );
    const idioma = readIdioma(item.idioma, index, push);
    const score = readScore(item.score_intencion, index, push);
    const intencion = readOptionalText(item.intencion, index, "intencion", 200, push);
    const clasificador = readOptionalText(
      item.clasificador,
      index,
      "clasificador",
      80,
      push,
    );
    const keywords = readKeywords(item.keywords, index, push);
    const borradorEs = readOptionalText(
      item.borrador_es,
      index,
      "borrador_es",
      8000,
      push,
    );
    const borradorEn = readOptionalText(
      item.borrador_en,
      index,
      "borrador_en",
      8000,
      push,
    );

    if (issueCount !== before) return;
    if (!redditId || !url || !title || !subreddit) return;

    valid.push({
      reddit_id: redditId,
      url,
      title,
      subreddit,
      author,
      created_utc: createdUtc,
      problema,
      pais_detectado: pais,
      idioma,
      score_intencion: score,
      intencion,
      clasificador,
      keywords,
      borrador_es: borradorEs,
      borrador_en: borradorEn,
    });
  });

  if (issueCount > 0) {
    const extra =
      issueCount > issues.length
        ? ` Se muestran los primeros ${issues.length}.`
        : "";
    return {
      ok: false,
      error: `El lote tiene leads inválidos. No se escribió ninguno.${extra}`,
      issues,
    };
  }

  const byId = new Map<string, ValidRedditWebLead>();
  for (const lead of valid) byId.set(lead.reddit_id, lead);
  const leads = [...byId.values()];

  return {
    ok: true,
    leads,
    received: body.length,
    deduped: valid.length - leads.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRedditId(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): string {
  if (typeof value !== "string" || !REDDIT_ID_RE.test(value.trim())) {
    push(
      index,
      "reddit_id",
      "reddit_id debe ser el id del post (por ejemplo abc123 o t3_abc123).",
    );
    return "";
  }
  return value.trim();
}

function readUrl(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): string {
  if (typeof value !== "string" || value.trim().length > 2048 || !isRedditPostUrl(value)) {
    push(index, "url", "url debe ser un enlace https de Reddit.");
    return "";
  }
  return new URL(value.trim()).toString();
}

function readRequiredText(
  value: unknown,
  index: number,
  field: string,
  max: number,
  push: (index: number, field: string, message: string) => void,
): string {
  if (typeof value !== "string" || !value.trim()) {
    push(index, field, `${field} es obligatorio.`);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    push(index, field, `${field} admite como máximo ${max} caracteres.`);
    return "";
  }
  return trimmed;
}

function readOptionalText(
  value: unknown,
  index: number,
  field: string,
  max: number,
  push: (index: number, field: string, message: string) => void,
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    push(index, field, `${field} debe ser texto o null.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    push(index, field, `${field} admite como máximo ${max} caracteres.`);
    return null;
  }
  return trimmed;
}

function readSubreddit(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): string {
  if (typeof value !== "string") {
    push(index, "subreddit", "subreddit es obligatorio.");
    return "";
  }
  let name = value.trim();
  if (name.toLowerCase().startsWith("r/")) name = name.slice(2).trim();
  if (!SUBREDDIT_RE.test(name)) {
    push(
      index,
      "subreddit",
      "subreddit debe ser el nombre del foro, por ejemplo webdev.",
    );
    return "";
  }
  return name;
}

function readTimestamp(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    push(index, "created_utc", "created_utc debe ser una fecha ISO-8601 o null.");
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    push(index, "created_utc", "created_utc debe ser una fecha ISO-8601 o null.");
    return null;
  }
  return parsed.toISOString();
}

function readIdioma(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): RedditWebIngestIdioma | null {
  if (value == null || value === "") return null;
  if (value === "es-MX" || value === "en-US") return value;
  push(index, "idioma", "idioma debe ser es-MX, en-US o null.");
  return null;
}

function readScore(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): number | null {
  if (value == null || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    push(
      index,
      "score_intencion",
      "score_intencion debe ser un número entre 0 y 1.",
    );
    return null;
  }
  return numeric;
}

function readKeywords(
  value: unknown,
  index: number,
  push: (index: number, field: string, message: string) => void,
): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    push(index, "keywords", "keywords debe ser un arreglo de textos.");
    return [];
  }
  if (value.length > 30) {
    push(index, "keywords", "keywords admite como máximo 30 elementos.");
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      push(index, "keywords", "keywords solo acepta textos.");
      return [];
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > 80) {
      push(index, "keywords", "Cada keyword admite como máximo 80 caracteres.");
      return [];
    }
    out.push(trimmed);
  }
  return out;
}
