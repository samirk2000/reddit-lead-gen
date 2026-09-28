import { MISSING_REDDIT_WEB_SCHEMA_MESSAGE } from "@/lib/reddit-web/constants";

export class RedditWebError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RedditWebError";
    this.code = code;
  }
}

/** Server configuration problem for the ingest route (HTTP 500). */
export class IngestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestConfigError";
  }
}

type DbErrorLike = {
  code?: string;
  message?: string;
};

const MISSING_SCHEMA =
  /schema cache|does not exist|could not find the table|could not find the /i;

export function isMissingRedditWebSchema(error: DbErrorLike): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    MISSING_SCHEMA.test(message)
  );
}

/** Spanish message for a PostgREST/Postgres failure on reddit_web_leads. */
export function redditWebDbErrorMessage(error: DbErrorLike): string {
  const code = error.code ?? "";
  if (isMissingRedditWebSchema(error)) return MISSING_REDDIT_WEB_SCHEMA_MESSAGE;
  if (code === "42501") {
    return "La base rechazó el acceso a los leads de Reddit. Vuelve a ejecutar la migración para crear las políticas RLS.";
  }
  if (code === "23505") {
    return "Ese reddit_id ya existe y no se pudo actualizar. Si la tabla vino del borrador del bot, asigna user_id a las filas viejas y vuelve a correr la migración.";
  }
  if (code === "23503") {
    return "REDDIT_INGEST_USER_ID no corresponde a un usuario de Supabase Auth.";
  }
  if (code === "23514") {
    return "Un lead no cumple las reglas de la tabla (idioma, estado o puntuación).";
  }
  return "No se pudo usar la base de leads de Reddit.";
}

export function throwIfRedditWebSchemaMissing(error: DbErrorLike): void {
  if (isMissingRedditWebSchema(error)) {
    throw new RedditWebError("MISSING_SCHEMA", MISSING_REDDIT_WEB_SCHEMA_MESSAGE);
  }
}
