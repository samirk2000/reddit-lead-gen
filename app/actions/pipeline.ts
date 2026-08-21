"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { runLeadGenerationPipelineForUser, type PipelineSummary } from "@/lib/pipeline/process-leads";

/** Result of a manual or cron pipeline trigger. */
export type PipelineActionResult = {
  ok: boolean;
  summary: PipelineSummary | null;
  error: string | null;
};

/**
 * Manually triggers the lead-generation pipeline for the currently logged-in
 * user. Requires an active Supabase session (provided by the cookie).
 */
export async function triggerPipelineAction(): Promise<PipelineActionResult> {
  const supabase = await createClient(cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, summary: null, error: "No autorizado." };
  }

  try {
    const summary = await runLeadGenerationPipelineForUser(user.id);
    return { ok: true, summary, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[pipeline] triggerPipelineAction falló:", error);
    return { ok: false, summary: null, error: message };
  }
}
