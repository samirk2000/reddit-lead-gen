"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  MAPS_SEARCHES_PER_HOUR,
  MISSING_PLACES_KEY_MESSAGE,
} from "@/lib/maps/constants";
import {
  MapsError,
  mapsDbErrorMessage,
  throwIfMapsSchemaMissing,
} from "@/lib/maps/errors";
import { searchPlaces } from "@/lib/maps/places";
import { personalizeMapsMessage } from "@/lib/maps/personalize";
import { leadDraftToInsert } from "@/lib/maps/persist";
import { buildLeadDrafts, normalizeSearchText } from "@/lib/maps/qualify";
import { isMapsLeadStatus } from "@/lib/maps/types";
import type { MapsSearchSummary } from "@/lib/maps/types";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import type {
  MapsLead,
  MapsLeadReason,
  MapsLeadStatus,
} from "@/lib/supabase/types";

const MAPS_PATH = "/dashboard/maps";
const HOUR_MS = 60 * 60 * 1000;

export type MapsSearchResult = {
  ok: boolean;
  message: string;
  summary?: MapsSearchSummary;
  leads?: MapsLead[];
};

export type MapsLeadMutationResult = {
  ok: boolean;
  message: string;
  lead?: MapsLead;
};

export type MapsTemplateResult = {
  ok: boolean;
  message: string;
  template?: string;
};

export type MapsPersonalizeResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

type PersonalizePayload = {
  name: string;
  specialty: string;
  city: string;
  rating: number | null;
  userRatingCount: number | null;
  address: string | null;
  leadReason: MapsLeadReason;
  template: string;
  currentMessage: string;
};

export async function searchMapsLeads(
  specialtyInput: string,
  cityInput: string,
): Promise<MapsSearchResult> {
  try {
    const userId = await requireUserId();
    const specialty = normalizeSearchText(specialtyInput);
    const city = normalizeSearchText(cityInput);
    if (specialty.length < 2 || specialty.length > 80) {
      throw new MapsError(
        "BAD_QUERY",
        "Escribe un giro o palabra clave (2 a 80 caracteres).",
      );
    }
    if (city.length < 2 || city.length > 80) {
      throw new MapsError(
        "BAD_QUERY",
        "Escribe una ciudad o zona (2 a 80 caracteres).",
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
    if (!apiKey) {
      throw new MapsError("MISSING_PLACES_KEY", MISSING_PLACES_KEY_MESSAGE);
    }

    const supabase = await createClient(cookies());
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const { count, error: countError } = await supabase
      .from("maps_search_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (countError) {
      console.error("[maps] rate-limit read failed", {
        code: countError.code,
        message: countError.message,
      });
      throwIfMapsSchemaMissing(countError);
      throw new MapsError("DB", mapsDbErrorMessage(countError));
    }

    if ((count ?? 0) >= MAPS_SEARCHES_PER_HOUR) {
      throw new MapsError(
        "RATE_LIMIT",
        `Llegaste al límite de ${MAPS_SEARCHES_PER_HOUR} búsquedas por hora. Así se cuida el costo de Google Places.`,
      );
    }

    const query = `${specialty} en ${city}`;
    const { places, pages } = await searchPlaces(query, apiKey);
    const { drafts, stats } = buildLeadDrafts(places, specialty, city);

    const { error: logError } = await supabase
      .from("maps_search_log")
      .insert({ user_id: userId });
    if (logError) {
      console.error("[maps] search log insert failed", {
        code: logError.code,
        message: logError.message,
      });
      throwIfMapsSchemaMissing(logError);
    }

    let leads: MapsLead[] = [];
    if (drafts.length > 0) {
      const seenAt = new Date().toISOString();
      const rows = drafts.map((draft) =>
        leadDraftToInsert(userId, draft, seenAt),
      );
      const { data, error } = await supabase
        .from("maps_leads")
        .upsert(rows, { onConflict: "user_id,place_id" })
        .select("*");
      if (error) {
        console.error("[maps] upsert failed", {
          code: error.code,
          message: error.message,
          query,
        });
        throwIfMapsSchemaMissing(error);
        throw new MapsError("DB", mapsDbErrorMessage(error));
      }
      leads = data ?? [];
    }

    console.log("[maps] search ok", { query, pages, ...stats });
    revalidatePath(MAPS_PATH);

    return {
      ok: true,
      message: `Se guardaron ${stats.leads} prospectos.`,
      summary: { query, pages, ...stats },
      leads,
    };
  } catch (error) {
    return failSearch(error);
  }
}

export async function updateMapsLead(
  leadId: string,
  patch: { status?: MapsLeadStatus; notes?: string },
): Promise<MapsLeadMutationResult> {
  try {
    const userId = await requireUserId();
    if (!leadId.trim()) {
      throw new MapsError("BAD_REQUEST", "Falta el prospecto a actualizar.");
    }
    if (patch.status === undefined && patch.notes === undefined) {
      throw new MapsError("BAD_REQUEST", "Nada que actualizar.");
    }
    if (patch.status !== undefined && !isMapsLeadStatus(patch.status)) {
      throw new MapsError("BAD_REQUEST", "Estado de prospecto inválido.");
    }
    if (patch.notes !== undefined && patch.notes.length > 4000) {
      throw new MapsError(
        "BAD_REQUEST",
        "Las notas pueden tener hasta 4000 caracteres.",
      );
    }

    const supabase = await createClient(cookies());
    const updates: {
      status?: MapsLeadStatus;
      notes?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.notes !== undefined) updates.notes = patch.notes;

    const { data, error } = await supabase
      .from("maps_leads")
      .update(updates)
      .eq("id", leadId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[maps] update failed", {
        code: error.code,
        message: error.message,
        leadId,
      });
      throwIfMapsSchemaMissing(error);
      throw new MapsError("DB", mapsDbErrorMessage(error));
    }
    if (!data) {
      throw new MapsError("NOT_FOUND", "No encontré ese prospecto.");
    }

    revalidatePath(MAPS_PATH);
    return { ok: true, message: "Prospecto actualizado.", lead: data };
  } catch (error) {
    return failMutation(error);
  }
}

/** Moves a lead from nuevo to contactado. Other statuses stay as they are. */
export async function markMapsLeadContacted(
  leadId: string,
): Promise<MapsLeadMutationResult> {
  try {
    const userId = await requireUserId();
    const supabase = await createClient(cookies());
    const { data, error } = await supabase
      .from("maps_leads")
      .update({
        status: "contactado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("user_id", userId)
      .eq("status", "nuevo")
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[maps] mark contacted failed", {
        code: error.code,
        message: error.message,
        leadId,
      });
      throwIfMapsSchemaMissing(error);
      throw new MapsError("DB", mapsDbErrorMessage(error));
    }

    if (data) {
      revalidatePath(MAPS_PATH);
      return { ok: true, message: "Marcado como contactado.", lead: data };
    }

    const current = await supabase
      .from("maps_leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (current.error) {
      throwIfMapsSchemaMissing(current.error);
      throw new MapsError("DB", mapsDbErrorMessage(current.error));
    }
    if (!current.data) {
      throw new MapsError("NOT_FOUND", "No encontré ese prospecto.");
    }
    return {
      ok: true,
      message: "El prospecto ya no estaba como nuevo.",
      lead: current.data,
    };
  } catch (error) {
    return failMutation(error);
  }
}

export async function saveMapsTemplate(
  templateInput: string,
): Promise<MapsTemplateResult> {
  try {
    const userId = await requireUserId();
    const template = templateInput.replace(/\r\n/g, "\n").trim();
    if (template.length < 10 || template.length > 1500) {
      throw new MapsError(
        "BAD_TEMPLATE",
        "La plantilla debe tener entre 10 y 1500 caracteres.",
      );
    }

    const supabase = await createClient(cookies());
    const { data, error } = await supabase
      .from("maps_settings")
      .upsert(
        {
          user_id: userId,
          whatsapp_template: template,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("whatsapp_template")
      .single();

    if (error) {
      console.error("[maps] template save failed", {
        code: error.code,
        message: error.message,
      });
      throwIfMapsSchemaMissing(error);
      throw new MapsError("DB", mapsDbErrorMessage(error));
    }

    revalidatePath(MAPS_PATH);
    return {
      ok: true,
      message: "Plantilla guardada.",
      template: data.whatsapp_template,
    };
  } catch (error) {
    const message = toMapsMessage(error);
    return { ok: false, message };
  }
}

export async function personalizeMapsLeadMessage(
  input: PersonalizePayload,
): Promise<MapsPersonalizeResult> {
  try {
    const userId = await requireUserId();
    if (!input.name.trim() || !input.specialty.trim() || !input.city.trim()) {
      throw new MapsError(
        "BAD_REQUEST",
        "Faltan datos del negocio para personalizar el mensaje.",
      );
    }

    const supabase = await createClient(cookies());
    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("gemini_api_key")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[maps] gemini key lookup failed", {
        code: error.code,
        message: error.message,
      });
    }

    const userKey = settings?.gemini_api_key?.trim();
    const text = userKey
      ? await personalizeMapsMessage(input, userKey)
      : await personalizeMapsMessage(input);

    return { ok: true, text };
  } catch (error) {
    return { ok: false, message: toMapsMessage(error) };
  }
}

function failSearch(error: unknown): MapsSearchResult {
  return { ok: false, message: toMapsMessage(error) };
}

function failMutation(error: unknown): MapsLeadMutationResult {
  return { ok: false, message: toMapsMessage(error) };
}

function toMapsMessage(error: unknown): string {
  if (error instanceof MapsError) return error.message;
  if (error instanceof Error && error.message === "No autorizado.") {
    return "Tu sesión expiró. Vuelve a entrar.";
  }
  console.error("[maps] unexpected error", {
    error: error instanceof Error ? error.message : String(error),
  });
  return "No se pudo completar la acción.";
}
