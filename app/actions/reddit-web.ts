"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isRedditWebLeadEstado, REDDIT_WEB_PATH } from "@/lib/reddit-web/constants";
import {
  RedditWebError,
  redditWebDbErrorMessage,
  throwIfRedditWebSchemaMissing,
} from "@/lib/reddit-web/errors";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import type { RedditWebLead, RedditWebLeadEstado } from "@/lib/supabase/types";

export type RedditWebLeadMutationResult = {
  ok: boolean;
  message: string;
  lead?: RedditWebLead;
};

export async function updateRedditWebLead(
  leadId: string,
  patch: { estado?: RedditWebLeadEstado; notas?: string },
): Promise<RedditWebLeadMutationResult> {
  try {
    const userId = await requireUserId();
    if (!leadId.trim()) {
      throw new RedditWebError("BAD_REQUEST", "Falta el lead a actualizar.");
    }
    if (patch.estado === undefined && patch.notas === undefined) {
      throw new RedditWebError("BAD_REQUEST", "Nada que actualizar.");
    }
    if (patch.estado !== undefined && !isRedditWebLeadEstado(patch.estado)) {
      throw new RedditWebError("BAD_REQUEST", "Estado de lead inválido.");
    }
    if (patch.notas !== undefined && patch.notas.length > 4000) {
      throw new RedditWebError(
        "BAD_REQUEST",
        "Las notas pueden tener hasta 4000 caracteres.",
      );
    }

    const supabase = await createClient(cookies());
    const updates: {
      estado?: RedditWebLeadEstado;
      notas?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (patch.estado !== undefined) updates.estado = patch.estado;
    if (patch.notas !== undefined) updates.notas = patch.notas;

    const { data, error } = await supabase
      .from("reddit_web_leads")
      .update(updates)
      .eq("id", leadId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[reddit-web] update failed", {
        code: error.code,
        message: error.message,
        leadId,
      });
      throwIfRedditWebSchemaMissing(error);
      throw new RedditWebError("DB", redditWebDbErrorMessage(error));
    }
    if (!data) {
      throw new RedditWebError("NOT_FOUND", "No encontré ese lead.");
    }

    revalidatePath(REDDIT_WEB_PATH);
    return { ok: true, message: "Lead actualizado.", lead: data };
  } catch (error) {
    return { ok: false, message: toRedditWebMessage(error) };
  }
}

function toRedditWebMessage(error: unknown): string {
  if (error instanceof RedditWebError) return error.message;
  if (error instanceof Error && error.message === "No autorizado.") {
    return "Tu sesión expiró. Vuelve a entrar.";
  }
  console.error("[reddit-web] unexpected error", {
    error: error instanceof Error ? error.message : String(error),
  });
  return "No se pudo completar la acción.";
}
