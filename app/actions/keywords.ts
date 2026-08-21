"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";

/** Result returned by keyword mutations. */
export type KeywordActionResult = {
  ok: boolean;
  message: string;
};

const MAX_PHRASE_LENGTH = 200;
const MAX_SUBREDDIT_LENGTH = 100;

/**
 * Adds a new keyword for the current user.
 *
 * @param prevState Unused, kept for the `useActionState` signature.
 */
export async function addKeyword(
  prevState: KeywordActionResult,
  formData: FormData,
): Promise<KeywordActionResult> {
  void prevState;
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const phrase = readRequired(formData, "phrase", MAX_PHRASE_LENGTH);
  if (!phrase.value) {
    return { ok: false, message: "La palabra clave es obligatoria." };
  }
  if (phrase.tooLong) {
    return { ok: false, message: "La palabra clave es demasiado larga." };
  }

  const subreddit = readOptional(formData, "subreddit", MAX_SUBREDDIT_LENGTH);
  if (subreddit.tooLong) {
    return { ok: false, message: "El subreddit es demasiado largo." };
  }

  const { error } = await supabase.from("keywords").insert({
    user_id: userId,
    phrase: phrase.value,
    subreddit: subreddit.value || "all",
    is_active: true,
  });

  if (error) {
    console.error("[keywords] addKeyword falló:", error);
    return { ok: false, message: "No se pudo agregar la keyword." };
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
  return { ok: true, message: "Keyword agregada." };
}

/**
 * Deletes a keyword owned by the current user.
 *
 * @param keywordId The UUID of the keyword to delete.
 */
export async function deleteKeyword(keywordId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { error } = await supabase
    .from("keywords")
    .delete()
    .eq("id", keywordId)
    .eq("user_id", userId);

  if (error) {
    console.error("[keywords] deleteKeyword falló:", error);
    throw new Error("No se pudo eliminar la keyword.");
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
}

/**
 * Toggles the active state of a keyword owned by the current user.
 *
 * @param keywordId The UUID of the keyword to update.
 * @param isActive  The new active state.
 */
export async function toggleKeyword(
  keywordId: string,
  isActive: boolean,
): Promise<void> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { error } = await supabase
    .from("keywords")
    .update({ is_active: isActive })
    .eq("id", keywordId)
    .eq("user_id", userId);

  if (error) {
    console.error("[keywords] toggleKeyword falló:", error);
    throw new Error("No se pudo actualizar la keyword.");
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
}

/** Reads a required trimmed field and flags oversize values. */
function readRequired(
  formData: FormData,
  key: string,
  maxLength: number,
): { value: string; tooLong: boolean } {
  const value = readOptional(formData, key, maxLength);
  return value;
}

/** Reads an optional trimmed field and flags oversize values. */
function readOptional(
  formData: FormData,
  key: string,
  maxLength: number,
): { value: string; tooLong: boolean } {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return { value, tooLong: value.length > maxLength };
}
