"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import { analyzeRedditPost } from "@/lib/ai/gemini";
import { detectLeadChannel } from "@/lib/leads/channel";
import { resolveSalesCta } from "@/lib/sales/brand";
import type { LeadStatus } from "@/lib/supabase/types";

const VALID_STATUSES = new Set<LeadStatus>([
  "new",
  "notified",
  "replied",
  "archived",
  "rejected",
]);

/**
 * Updates the status of a lead owned by the current user.
 */
export async function updateLeadStatus(
  leadId: string,
  status: string,
): Promise<void> {
  const userId = await requireUserId();

  if (!VALID_STATUSES.has(status as LeadStatus)) {
    throw new Error("Estado de lead inválido.");
  }

  const supabase = await createClient(cookies());

  const updates: { status: LeadStatus; follow_up_at?: string | null } = {
    status: status as LeadStatus,
  };
  // Clearing snooze when reopening / marking replied / archiving.
  if (status === "notified" || status === "replied" || status === "archived") {
    updates.follow_up_at = null;
  }

  const { error } = await supabase
    .from("detected_leads")
    .update(updates)
    .eq("id", leadId)
    .eq("user_id", userId);

  if (error) {
    console.error("[leads] updateLeadStatus falló:", error);
    throw new Error("No se pudo actualizar el lead.");
  }

  revalidatePath("/dashboard");
}

/** Snooze lead out of Todos until tomorrow (follow-up queue). */
export async function snoozeLeadFollowUp(leadId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const when = new Date();
  when.setDate(when.getDate() + 1);

  const { error } = await supabase
    .from("detected_leads")
    .update({
      follow_up_at: when.toISOString(),
      status: "notified",
    })
    .eq("id", leadId)
    .eq("user_id", userId);

  if (error) {
    console.error("[leads] snoozeLeadFollowUp falló:", error);
    const missing =
      /follow_up_at/i.test(error.message) || error.code === "PGRST204";
    throw new Error(
      missing
        ? "Falta migrar follow_up_at. Corré supabase/migrations/20260320_dual_replies_followup.sql"
        : "No se pudo programar el follow-up.",
    );
  }

  revalidatePath("/dashboard");
}

/** Clear snooze and put lead back in actionable queue. */
export async function clearLeadFollowUp(leadId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { error } = await supabase
    .from("detected_leads")
    .update({ follow_up_at: null, status: "notified" })
    .eq("id", leadId)
    .eq("user_id", userId);

  if (error) {
    console.error("[leads] clearLeadFollowUp falló:", error);
    throw new Error("No se pudo quitar el follow-up.");
  }

  revalidatePath("/dashboard");
}

export type RegenerateReplyResult = {
  ok: boolean;
  message: string;
  suggested_reply?: string;
  suggested_reply_wa?: string;
};

/** Re-run Gemini for a lead and refresh both reply variants. */
export async function regenerateLeadReplies(
  leadId: string,
): Promise<RegenerateReplyResult> {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data: lead, error: leadErr } = await supabase
    .from("detected_leads")
    .select(
      "id, title, content, subreddit, post_url, keyword_id",
    )
    .eq("id", leadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (leadErr || !lead) {
    return { ok: false, message: "Lead no encontrado." };
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select(
      "gemini_api_key, whatsapp_number, whatsapp_url, website_url, business_name",
    )
    .eq("id", userId)
    .maybeSingle();

  let keywordPhrase = "iptv";
  if (lead.keyword_id) {
    const { data: kw } = await supabase
      .from("keywords")
      .select("phrase")
      .eq("id", lead.keyword_id)
      .maybeSingle();
    if (kw?.phrase) keywordPhrase = kw.phrase;
  }

  try {
    const analysis = await analyzeRedditPost(
      lead.title,
      lead.content ?? "",
      keywordPhrase,
      {
        userApiKey: settings?.gemini_api_key ?? undefined,
        channel: detectLeadChannel(lead),
        salesCta: resolveSalesCta({
          whatsappNumber: settings?.whatsapp_number,
          whatsappUrl: settings?.whatsapp_url,
          websiteUrl: settings?.website_url,
          businessName: settings?.business_name,
        }),
      },
    );

    const { error: updErr } = await supabase
      .from("detected_leads")
      .update({
        intent_score: analysis.intent_score,
        analysis_reasoning: analysis.analysis_reasoning,
        suggested_reply: analysis.suggested_reply,
        suggested_reply_wa: analysis.suggested_reply_wa,
      })
      .eq("id", leadId)
      .eq("user_id", userId);

    if (updErr) {
      const missing =
        /suggested_reply_wa/i.test(updErr.message) ||
        updErr.code === "PGRST204";
      return {
        ok: false,
        message: missing
          ? "Falta migrar suggested_reply_wa. Corré supabase/migrations/20260320_dual_replies_followup.sql"
          : "No se pudo guardar la nueva respuesta.",
      };
    }

    revalidatePath("/dashboard");
    return {
      ok: true,
      message: "Respuestas regeneradas.",
      suggested_reply: analysis.suggested_reply,
      suggested_reply_wa: analysis.suggested_reply_wa,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[leads] regenerateLeadReplies:", message);
    return { ok: false, message: `Gemini falló: ${message.slice(0, 160)}` };
  }
}
