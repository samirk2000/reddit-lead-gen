/** Production wiring for the drip: Supabase store, Telegram Bot API, daily list, mark-status. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DigestBusiness } from "@/lib/maps/digest";
import { markStatusDecision } from "@/lib/maps/mark-status";
import { resolveRedditWebOwnerId } from "@/lib/reddit-web/owner";
import { createServiceClient } from "@/lib/supabase/service";
import type { MapsLeadStatus } from "@/lib/supabase/types";
import type { DripDay, DripState } from "./core";
import type { DripDeps, DripStore } from "./engine";

/** Lead statuses that keep a business out of the drip (enviado_a_lista is every list item, so not here). */
const BLOCKING_STATUSES = ["contactado", "respondió", "cerrado", "descartado"];

// The drip tables are not in the generated Database types yet.
type Loose = SupabaseClient<any>;

export function supabaseDripStore(db: Loose, userId: string): DripStore {
  return {
    async loadState() {
      const r = await db.from("telegram_drip_state").select("*").eq("id", 1).maybeSingle();
      if (r.error) throw new Error(`drip state: ${r.error.message}`);
      const row = r.data ?? { paused: false, pending: null, last_action_at: 0, next_at: 0, version: 0 };
      return {
        state: { paused: !!row.paused, pending: row.pending ?? null, last_action_at: Number(row.last_action_at) || 0, next_at: Number(row.next_at) || 0 },
        version: Number(row.version) || 0,
      };
    },
    async saveState(state: DripState, version: number) {
      const r = await db.from("telegram_drip_state")
        .update({ ...state, version: version + 1, updated_at: new Date().toISOString() })
        .eq("id", 1).eq("version", version).select("id");
      if (r.error) throw new Error(`drip state save: ${r.error.message}`);
      return (r.data?.length ?? 0) === 1;
    },
    async loadDay(date: string): Promise<DripDay> {
      const r = await db.from("telegram_drip_days").select("*").eq("date", date).maybeSingle();
      if (r.error) throw new Error(`drip day: ${r.error.message}`);
      const x = r.data;
      return { date, sent: x?.sent ?? [], user_skipped: x?.user_skipped ?? [], skipped: x?.skipped ?? [], recap_sent: !!x?.recap_sent };
    },
    async saveDay(day: DripDay) {
      const r = await db.from("telegram_drip_days").upsert({ ...day, updated_at: new Date().toISOString() }, { onConflict: "date" });
      if (r.error) throw new Error(`drip day save: ${r.error.message}`);
    },
    async isBlocked(k: string, placeId: string) {
      const dnc = await db.from("telegram_drip_dnc").select("reason").eq("phone10", k).maybeSingle();
      if (dnc.error) throw new Error(`drip dnc: ${dnc.error.message}`);
      if (dnc.data) return `no contactar: ${dnc.data.reason}`;
      if (!placeId) return null;
      const lead = await db.from("maps_leads").select("status").eq("user_id", userId).eq("place_id", placeId).maybeSingle();
      if (lead.error) throw new Error(`drip lead: ${lead.error.message}`);
      return lead.data && BLOCKING_STATUSES.includes(lead.data.status) ? `ya está como ${lead.data.status}` : null;
    },
    async block(k: string, reason: string) {
      const r = await db.from("telegram_drip_dnc").upsert({ phone10: k, reason }, { onConflict: "phone10", ignoreDuplicates: true });
      if (r.error) throw new Error(`drip dnc save: ${r.error.message}`);
    },
  };
}

export async function telegramApi(method: string, body: Record<string, unknown>): Promise<{ message_id?: number } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!j.ok) { console.error("[drip] telegram", method, r.status, j.description ?? ""); return null; }
  return j.result ?? {};
}

export async function createLiveDripDeps(origin: string): Promise<DripDeps> {
  const db = createServiceClient() as unknown as Loose;
  const userId = await resolveRedditWebOwnerId(createServiceClient());
  const digestSecret = process.env.MAPS_DIGEST_SECRET?.trim() ?? "";
  let cache: DigestBusiness[] | null = null;
  return {
    store: supabaseDripStore(db, userId),
    tg: telegramApi,
    log: (...a) => console.log(...a),
    fetchList: async () => {
      if (cache) return cache;
      const r = await fetch(`${origin}/api/maps/daily-list`, { headers: { authorization: `Bearer ${digestSecret}` }, signal: AbortSignal.timeout(55_000) });
      const j = (await r.json()) as { ok?: boolean; businesses?: DigestBusiness[]; error?: string };
      if (!j.ok) throw new Error(`daily-list: ${j.error ?? r.status}`);
      cache = j.businesses ?? [];
      return cache;
    },
    markStatus: async (b, status) => {
      if (!b.place_id) return;
      const found = await db.from("maps_leads").select("id, status").eq("user_id", userId).eq("place_id", b.place_id).maybeSingle();
      if (found.error || !found.data) return;
      const decision = markStatusDecision(found.data.status as MapsLeadStatus, status);
      if (decision.unchanged) return;
      await db.from("maps_leads").update({ status: decision.status, updated_at: new Date().toISOString() }).eq("id", found.data.id);
      console.log("[drip] mark-status", { placeId: b.place_id, status: decision.status });
    },
  };
}
