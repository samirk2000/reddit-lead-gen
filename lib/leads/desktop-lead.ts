import { createHash } from "node:crypto";
import { redditPostHref } from "../reddit-web/links";

export const DESKTOP_INGEST_PATH = "/api/leads/ingest";

const ISSUE_LIMIT = 20;
const SUBREDDIT_RE = /^[A-Za-z0-9_]{2,50}$/;

export type DesktopLeadKind = "post" | "comment";

export type DesktopLeadIssue = {
  field: string;
  message: string;
};

/** One raw lead from the Windows scanner, before Gemini. */
export type DesktopLead = {
  url: string;
  subreddit: string;
  title: string;
  body: string;
  author: string | null;
  created_at: string;
  kind: DesktopLeadKind;
  local_score: number | null;
  keywords: string[];
  reddit_post_id: string;
};

export type ParsedDesktopLead =
  | { ok: true; lead: DesktopLead }
  | { ok: false; error: string; issues: DesktopLeadIssue[] };

/**
 * Accepts one JSON object. Arrays and `{ leads: [...] }` are rejected so a
 * Gemini call stays inside one serverless request.
 */
export function parseDesktopLead(body: unknown): ParsedDesktopLead {
  if (Array.isArray(body) || (isRecord(body) && Array.isArray(body.leads))) {
    return {
      ok: false,
      error:
        "Envía un solo objeto JSON por petición, no un arreglo. El buscador debe hacer un POST por lead.",
      issues: [],
    };
  }

  if (!isRecord(body)) {
    return {
      ok: false,
      error: "El cuerpo debe ser un objeto JSON con el lead.",
      issues: [],
    };
  }

  if ("borrador_es" in body || "reddit_id" in body) {
    return {
      ok: false,
      error:
        "Este endpoint califica el lead con Gemini. El formato con borrador_es y reddit_id va a POST /api/reddit-web/ingest.",
      issues: [],
    };
  }

  const issues: DesktopLeadIssue[] = [];
  const push = (field: string, message: string) => {
    if (issues.length < ISSUE_LIMIT) issues.push({ field, message });
  };

  const url = readUrl(body.url, push);
  const subreddit = readSubreddit(body.subreddit, push);
  const title = readRequiredText(body.title, "title", 500, push);
  const leadBody = readBody(body.body, push);
  const author = readOptionalText(body.author, "author", 80, push);
  const createdAt = readCreatedAt(body.created_at, push);
  const kind = readKind(body.kind, push);
  const localScore = readLocalScore(body.local_score, push);
  const keywords = readKeywords(body.keywords, push);

  if (issues.length > 0 || !url || !subreddit || !title || !createdAt || !kind) {
    return {
      ok: false,
      error: "El lead no cumple el esquema. No se guardó nada.",
      issues,
    };
  }

  return {
    ok: true,
    lead: {
      url,
      subreddit,
      title,
      body: leadBody,
      author,
      created_at: createdAt,
      kind,
      local_score: localScore,
      keywords,
      reddit_post_id: redditStableId(url),
    },
  };
}

/** Canonical https URL used as the dedupe key. */
export function canonicalRedditUrl(raw: string): string | null {
  const href = redditPostHref(raw);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  if (host === "reddit.com" || host.endsWith(".reddit.com")) {
    url.hostname = "www.reddit.com";
  }
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path || "/";
  if (!isLeadPermalink(url)) return null;
  return url.toString();
}

export function redditStableId(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  if (url.hostname === "redd.it") {
    const id = url.pathname.replace(/\//g, "");
    return id ? `t3_${id}` : hashId(canonicalUrl);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const commentsAt = parts.indexOf("comments");
  const postId = commentsAt >= 0 ? parts[commentsAt + 1] : undefined;
  const commentId = commentsAt >= 0 ? parts[commentsAt + 3] : undefined;
  if (commentId && /^[A-Za-z0-9]+$/.test(commentId)) return `t1_${commentId}`;
  if (postId && /^[A-Za-z0-9]+$/.test(postId)) return `t3_${postId}`;
  return hashId(canonicalUrl);
}

function isLeadPermalink(url: URL): boolean {
  if (url.hostname === "redd.it") return url.pathname.length > 1;
  return /\/comments\/[A-Za-z0-9]+/i.test(url.pathname);
}

function hashId(value: string): string {
  return `url_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readUrl(
  value: unknown,
  push: (field: string, message: string) => void,
): string {
  if (typeof value !== "string" || !value.trim()) {
    push("url", "url es obligatoria y debe ser un https de Reddit (el permalink del post o comentario).");
    return "";
  }
  const canonical = canonicalRedditUrl(value);
  if (!canonical) {
    push(
      "url",
      "url debe ser el permalink https del post o comentario (reddit.com/.../comments/... o redd.it/...).",
    );
    return "";
  }
  return canonical;
}

function readSubreddit(
  value: unknown,
  push: (field: string, message: string) => void,
): string {
  if (typeof value !== "string") {
    push("subreddit", "subreddit es obligatorio.");
    return "";
  }
  let name = value.trim();
  if (name.toLowerCase().startsWith("r/")) name = name.slice(2).trim();
  if (!SUBREDDIT_RE.test(name)) {
    push("subreddit", "subreddit debe ser el nombre del foro, por ejemplo firetvstick.");
    return "";
  }
  return name;
}

function readRequiredText(
  value: unknown,
  field: string,
  max: number,
  push: (field: string, message: string) => void,
): string {
  if (typeof value !== "string" || !value.trim()) {
    push(field, `${field} es obligatorio.`);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    push(field, `${field} admite como máximo ${max} caracteres.`);
    return "";
  }
  return trimmed;
}

function readBody(
  value: unknown,
  push: (field: string, message: string) => void,
): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    push("body", "body debe ser texto. Si el post no tiene texto, manda una cadena vacía.");
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > 8000) {
    push("body", "body admite como máximo 8000 caracteres.");
    return "";
  }
  return trimmed;
}

function readOptionalText(
  value: unknown,
  field: string,
  max: number,
  push: (field: string, message: string) => void,
): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    push(field, `${field} debe ser texto o null.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    push(field, `${field} admite como máximo ${max} caracteres.`);
    return null;
  }
  return trimmed;
}

function readCreatedAt(
  value: unknown,
  push: (field: string, message: string) => void,
): string {
  if (typeof value !== "string" || !value.trim()) {
    push("created_at", "created_at es obligatorio y debe ser fecha ISO-8601.");
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    push("created_at", "created_at debe ser una fecha ISO-8601, por ejemplo 2026-10-13T04:00:00Z.");
    return "";
  }
  return parsed.toISOString();
}

function readKind(
  value: unknown,
  push: (field: string, message: string) => void,
): DesktopLeadKind | null {
  if (value === "post" || value === "comment") return value;
  push("kind", "kind debe ser \"post\" o \"comment\".");
  return null;
}

function readLocalScore(
  value: unknown,
  push: (field: string, message: string) => void,
): number | null {
  if (value == null || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
    push("local_score", "local_score es opcional y debe ser un número entre 0 y 10.");
    return null;
  }
  return numeric;
}

function readKeywords(
  value: unknown,
  push: (field: string, message: string) => void,
): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    push("keywords", "keywords debe ser un arreglo de textos.");
    return [];
  }
  if (value.length > 20) {
    push("keywords", "keywords admite como máximo 20 elementos.");
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      push("keywords", "keywords solo acepta textos.");
      return [];
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > 80) {
      push("keywords", "Cada keyword admite como máximo 80 caracteres.");
      return [];
    }
    out.push(trimmed);
  }
  return out;
}
