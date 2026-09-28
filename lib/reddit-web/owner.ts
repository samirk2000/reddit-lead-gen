import { IngestConfigError } from "@/lib/reddit-web/errors";
import type { SupabaseServiceClient } from "@/lib/supabase/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner for rows inserted by the external bot.
 * Uses REDDIT_INGEST_USER_ID when set. Otherwise the only Auth user.
 */
export async function resolveRedditWebOwnerId(
  supabase: SupabaseServiceClient,
): Promise<string> {
  const fromEnv = process.env.REDDIT_INGEST_USER_ID?.trim() ?? "";
  if (fromEnv) {
    if (!UUID_RE.test(fromEnv)) {
      throw new IngestConfigError(
        "REDDIT_INGEST_USER_ID no es un UUID de Supabase Auth.",
      );
    }
    const { data, error } = await supabase.auth.admin.getUserById(fromEnv);
    if (error || !data.user) {
      console.error("[reddit-web] owner lookup failed", {
        message: error?.message ?? "user missing",
      });
      throw new IngestConfigError(
        "REDDIT_INGEST_USER_ID no corresponde a un usuario de Supabase Auth.",
      );
    }
    return data.user.id;
  }

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 2 });
  if (listed.error) {
    console.error("[reddit-web] list users failed", {
      message: listed.error.message,
    });
    throw new IngestConfigError(
      "No se pudo resolver el usuario dueño de los leads.",
    );
  }

  const users = listed.data.users;
  const only = users.length === 1 ? users[0] : undefined;
  if (only) return only.id;

  if (users.length === 0) {
    throw new IngestConfigError(
      "No hay usuarios en Supabase Auth. Entra a la app para crear la cuenta, o define REDDIT_INGEST_USER_ID.",
    );
  }

  throw new IngestConfigError(
    "Hay más de un usuario. Define REDDIT_INGEST_USER_ID con el UUID del dueño (Supabase → Authentication → Users).",
  );
}
