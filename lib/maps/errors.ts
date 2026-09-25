import { MISSING_MAPS_SCHEMA_MESSAGE } from "@/lib/maps/constants";

export class MapsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MapsError";
    this.code = code;
  }
}

type DbErrorLike = {
  code?: string;
  message?: string;
};

const MISSING_SCHEMA = /schema cache|does not exist|could not find the table|could not find the /i;

export function isMissingMapsSchema(error: DbErrorLike): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    MISSING_SCHEMA.test(message)
  );
}

/** Spanish message for a PostgREST/Postgres failure on the maps tables. */
export function mapsDbErrorMessage(error: DbErrorLike): string {
  const code = error.code ?? "";
  if (isMissingMapsSchema(error)) return MISSING_MAPS_SCHEMA_MESSAGE;
  if (code === "42501") {
    return "La base rechazó el acceso a los prospectos. Vuelve a ejecutar la migración para crear las políticas RLS.";
  }
  return "No se pudo usar la base de prospectos.";
}

export function throwIfMapsSchemaMissing(error: DbErrorLike): void {
  if (isMissingMapsSchema(error)) {
    throw new MapsError("MISSING_SCHEMA", MISSING_MAPS_SCHEMA_MESSAGE);
  }
}
