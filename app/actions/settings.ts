"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import {
  normalizeWebsiteUrl,
  normalizeWhatsappDigits,
  normalizeWhatsappUrl,
} from "@/lib/sales/cta";
import type { UserSettings } from "@/lib/supabase/types";

/** Result returned to the settings form after a save attempt. */
export type SettingsActionResult = {
  ok: boolean;
  message: string;
};

const MAX_TOKEN_LENGTH = 300;

/**
 * Updates the current user's `user_settings`.
 *
 * Empty/masked sentinel values are kept as-is (the input uses a masked
 * placeholder representing the stored value). A token that still holds the
 * masked placeholder is intentionally not overwritten.
 */
export async function updateSettings(
  prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  void prevState;
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const telegramBotToken = readStringField(formData, "telegram_bot_token");
  const telegramChatId = readStringField(formData, "telegram_chat_id");
  const geminiApiKey = readStringField(formData, "gemini_api_key");
  const whatsappRaw = readStringField(formData, "whatsapp_number");
  const whatsappUrlRaw = readStringField(formData, "whatsapp_url");
  const websiteRaw = readStringField(formData, "website_url");
  const businessName = readStringField(formData, "business_name");
  const isActive = formData.get("is_active") === "on";

  // Masked placeholders mirroring the stored secrets (see settings page).
  const MASKED_BOT = "••••••••";
  const MASKED_GEMINI = "••••••••";

  const updates: Partial<UserSettings> = {
    is_active: isActive,
    business_name: businessName || null,
  };

  if (telegramChatId) {
    updates.telegram_chat_id = telegramChatId;
  }
  if (telegramBotToken && telegramBotToken !== MASKED_BOT) {
    updates.telegram_bot_token = telegramBotToken;
  }
  if (geminiApiKey && geminiApiKey !== MASKED_GEMINI) {
    updates.gemini_api_key = geminiApiKey;
  }

  if (whatsappRaw) {
    const digits = normalizeWhatsappDigits(whatsappRaw);
    if (!digits) {
      return {
        ok: false,
        message:
          "WhatsApp inválido. Usá solo el número con código de país (ej. 5216622684690).",
      };
    }
    updates.whatsapp_number = digits;
  } else {
    updates.whatsapp_number = null;
  }

  if (whatsappUrlRaw) {
    const waUrl = normalizeWhatsappUrl(whatsappUrlRaw);
    if (!waUrl) {
      return {
        ok: false,
        message:
          "Link de WhatsApp inválido. Ej: https://api.whatsapp.com/message/...",
      };
    }
    updates.whatsapp_url = waUrl;
  } else {
    updates.whatsapp_url = null;
  }

  if (websiteRaw) {
    const site = normalizeWebsiteUrl(websiteRaw);
    if (!site) {
      return {
        ok: false,
        message: "URL de web inválida. Ej: https://swiftyalatino.com",
      };
    }
    updates.website_url = site;
  } else {
    updates.website_url = null;
  }

  if (
    typeof updates.telegram_bot_token === "string" &&
    updates.telegram_bot_token.trim().length > MAX_TOKEN_LENGTH
  ) {
    return { ok: false, message: "El token de Telegram es demasiado largo." };
  }

  const { error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[settings] updateSettings falló:", error);
    const missingCol =
      /whatsapp_number|whatsapp_url|website_url|business_name/i.test(
        error.message,
      ) || error.code === "PGRST204";
    return {
      ok: false,
      message: missingCol
        ? "Falta migrar columnas en Supabase. Corré el SQL de supabase/migrations/20260320_add_sales_cta.sql"
        : "No se pudo guardar la configuración.",
    };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Configuración guardada correctamente." };
}

/** Reads a trimmed string field from FormData, or "". */
function readStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
