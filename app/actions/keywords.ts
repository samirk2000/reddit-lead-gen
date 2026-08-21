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
 * Broad, common keywords used to quickly bootstrap a test account so a manual
 * scan matches something. These are deliberately generic to exercise the
 * match + AI-scoring path end to end.
 */
const TEST_KEYWORDS = [
  "remote",
  "setup",
  "app",
  "player",
  "recommend",
  "best",
];

const TEST_SUBREDDIT = "all";

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

/**
 * Seeds broad test keywords for the current user, skipping any phrase/subreddit
 * combination they already have. Useful to bootstrap a test account for a
 * manual scan without typing each keyword by hand.
 */
export async function seedTestKeywords(): Promise<KeywordActionResult> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  // Load existing phrases (all subreddits) so we don't create duplicates.
  const { data: existing, error: loadError } = await supabase
    .from("keywords")
    .select("phrase, subreddit")
    .eq("user_id", userId);

  if (loadError) {
    console.error("[keywords] seedTestKeywords: no se pudo leer keywords:", loadError);
    return { ok: false, message: "No se pudieron leer las keywords existentes." };
  }

  const have = new Set(
    (existing ?? []).map((k) => `${k.phrase.toLowerCase()}|${k.subreddit.toLowerCase()}`),
  );

  const rows = TEST_KEYWORDS.filter(
    (phrase) => !have.has(`${phrase.toLowerCase()}|${TEST_SUBREDDIT}`),
  ).map((phrase) => ({
    user_id: userId,
    phrase,
    subreddit: TEST_SUBREDDIT,
    is_active: true,
  }));

  if (rows.length === 0) {
    return { ok: true, message: "Ya tenías todas las keywords de prueba." };
  }

  const { error } = await supabase.from("keywords").insert(rows);

  if (error) {
    console.error("[keywords] seedTestKeywords falló:", error);
    return { ok: false, message: "No se pudo sembrar las keywords de prueba." };
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
  return { ok: true, message: `${rows.length} keywords de prueba agregadas.` };
}

/**
 * Bulk-adds multiple keywords from pasted text, one per line.
 *
 * Each line may be either a bare phrase (uses the default subreddit) or
 * `phrase, subreddit`. Empty lines are skipped and values are trimmed.
 *
 * @param prevState        Unused, kept for the `useActionState` signature.
 * @param formData         Form fields: `keywords` (multiline) and
 *                         `defaultSubreddit`.
 */
export async function bulkAddKeywords(
  prevState: KeywordActionResult,
  formData: FormData,
): Promise<KeywordActionResult> {
  void prevState;
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const rawInput = readOptional(formData, "keywords", 100_000);
  if (rawInput.tooLong) {
    return { ok: false, message: "El lote de keywords es demasiado grande." };
  }

  const defaultSubreddit = readOptional(
    formData,
    "defaultSubreddit",
    MAX_SUBREDDIT_LENGTH,
  );
  if (defaultSubreddit.tooLong) {
    return { ok: false, message: "El subreddit por defecto es demasiado largo." };
  }
  const defaultSub = defaultSubreddit.value || "all";

  const parsed = parseBulkKeywords(rawInput.value, defaultSub);
  if (parsed.length === 0) {
    return {
      ok: false,
      message: "No se encontraron keywords válidas para importar.",
    };
  }

  const rows = parsed.map(({ phrase, subreddit }) => ({
    user_id: userId,
    phrase,
    subreddit,
    is_active: true,
  }));

  const { error } = await supabase.from("keywords").insert(rows);

  if (error) {
    console.error("[keywords] bulkAddKeywords falló:", error);
    return { ok: false, message: "No se pudo importar las keywords." };
  }

  revalidatePath("/dashboard/keywords");
  revalidatePath("/dashboard");
  return { ok: true, message: `${rows.length} keywords importadas.` };
}

/**
 * Parses bulk keyword text into normalized rows.
 *
 * Accepts a comma-separated `phrase, subreddit` per line. Lines without a comma
 * use `defaultSubreddit`. Empty result lines are dropped.
 */
function parseBulkKeywords(
  input: string,
  defaultSubreddit: string,
): { phrase: string; subreddit: string }[] {
  const result: { phrase: string; subreddit: string }[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const commaIndex = line.indexOf(",");
    const phraseValue =
      commaIndex >= 0 ? line.slice(0, commaIndex).trim() : line.trim();
    const subValue =
      commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : defaultSubreddit;

    const phrase = phraseValue.slice(0, MAX_PHRASE_LENGTH);
    const subreddit =
      subValue.slice(0, MAX_SUBREDDIT_LENGTH).replace(/^r\//, "") || "all";

    if (!phrase) continue;
    result.push({ phrase, subreddit });
  }

  return result;
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
