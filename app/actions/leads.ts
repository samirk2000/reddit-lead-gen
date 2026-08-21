"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
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
 *
 * @param leadId   The UUID of the lead to update.
 * @param status   The new status (e.g. `replied` or `archived`).
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

  const { error } = await supabase
    .from("detected_leads")
    .update({ status: status as LeadStatus })
    .eq("id", leadId)
    .eq("user_id", userId);

  if (error) {
    console.error("[leads] updateLeadStatus falló:", error);
    throw new Error("No se pudo actualizar el lead.");
  }

  revalidatePath("/dashboard");
}
