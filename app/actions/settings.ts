"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
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
  const isActive = formData.get("is_active") === "on";

  // Masked placeholders mirroring the stored secrets (see settings page).
  const MASKED_BOT = "••••••••";
  const MASKED_GEMINI = "••••••••";

  const updates: Partial<UserSettings> = { is_active: isActive };

  if (telegramChatId) {
    updates.telegram_chat_id = telegramChatId;
  }
  if (telegramBotToken && telegramBotToken !== MASKED_BOT) {
    updates.telegram_bot_token = telegramBotToken;
  }
  if (geminiApiKey && geminiApiKey !== MASKED_GEMINI) {
    updates.gemini_api_key = geminiApiKey;
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
    return {
      ok: false,
      message: "No se pudo guardar la configuración.",
    };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Configuración guardada correctamente." };
}

/** Reads a trimmed string field from FormData, or "". */
function readStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
