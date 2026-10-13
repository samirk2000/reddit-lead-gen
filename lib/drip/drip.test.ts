import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTick, likelyLandline, localTime, parseCallback, quotaFor, type DripDay, type DripPending, type DripState } from "./core";
import { handleCommand, onCallbackQuery, tick, type DripDeps, type DripStore } from "./engine";

const OWNER = 6322691345;
function memStore() {
  let state: DripState = { paused: false, pending: null, last_action_at: 0, next_at: 0 };
  let version = 0;
  const days = new Map<string, DripDay>();
  const dnc = new Map<string, string>();
  const store: DripStore = {
    async loadState() { return { state: structuredClone(state), version }; },
    async saveState(s, v) { if (v !== version) return false; state = structuredClone(s); version++; return true; },
    async loadDay(date) { return structuredClone(days.get(date) ?? { date, sent: [], user_skipped: [], skipped: [], recap_sent: false }); },
    async saveDay(d) { days.set(d.date, structuredClone(d)); },
    async isBlocked(k) { return dnc.has(k) ? dnc.get(k)! : null; },
    async block(k, r) { if (!dnc.has(k)) dnc.set(k, r); },
  };
  return { store, dnc, get state() { return state; }, pending: (): DripPending | null => state.pending };
}
const biz = (name: string, phone: string) => ({
  place_id: `p_${phone}`, name, giro: "arquitecto", city: "CDMX", rating: 4.5, reviews: 10, phone, maps_url: "https://maps.example",
  score: 1, apertura: "Hola, le escribo de Torio Web. Hola", wa_link: `https://wa.me/${phone}?text=Hola%2C%20le%20escribo%20de%20Torio%20Web.`,
});

function setup(now: { t: Date }) {
  const m = memStore();
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const marks: string[] = [];
  const deps: DripDeps = {
    store: m.store, now: () => now.t, rnd: () => 0.5, log: () => undefined,
    fetchList: async () => [biz("A", "525521437788"), biz("PBX", "523338274500"), biz("B", "525546829131"), biz("C", "525546829132")],
    markStatus: async (_b, s) => { marks.push(s); },
    tg: async (method, body) => { calls.push({ method, body }); return { message_id: calls.length }; },
  };
  return { m, deps, calls, marks };
}
const cq = (data: string, from = OWNER) => ({ id: "q1", data, from: { id: from }, message: { message_id: 1, chat: { id: OWNER } } });

describe("drip core", () => {
  it("quota ramps 15 → 20 on Mon–Sat", () => {
    assert.equal(quotaFor("2026-10-13"), 15);
    assert.equal(quotaFor("2026-10-14"), 16);
    assert.equal(quotaFor("2026-10-17"), 19);
    assert.equal(quotaFor("2026-10-18"), 19); // Sunday adds nothing; 14–17 = 4 days
    assert.equal(quotaFor("2026-11-30"), 20);
  });
  it("switchboard filter", () => {
    assert.ok(likelyLandline("523338274500"));
    assert.equal(likelyLandline("525552116051"), null);
  });
  it("parses callbacks", () => {
    assert.deepEqual(parseCallback("drip:nowa:5546829132"), { kind: "nowa", k: "5546829132" });
    assert.equal(parseCallback("drip:done"), null);
  });
  it("window 11–20 CDMX Mon–Sat", () => {
    const st: DripState = { paused: false, pending: null, last_action_at: 0, next_at: 0 };
    const day = (date: string): DripDay => ({ date, sent: [], user_skipped: [], skipped: [], recap_sent: false });
    assert.equal(decideTick(st, day("2026-10-13"), new Date("2026-10-13T10:59:00-06:00")).action, "none");
    assert.equal(decideTick(st, day("2026-10-13"), new Date("2026-10-13T19:59:00-06:00")).action, "send");
    assert.equal(decideTick(st, day("2026-10-13"), new Date("2026-10-13T20:00:00-06:00")).action, "none");
    assert.equal(decideTick(st, day("2026-10-18"), new Date("2026-10-18T12:00:00-06:00")).action, "none");
    assert.equal(localTime(new Date("2026-10-13T19:30:00-06:00")).hour, 19);
  });
});

describe("drip engine", () => {
  it("offers, skips, waits 4–6 min, confirms, no-WhatsApp, recap at 20:00", async () => {
    const now = { t: new Date("2026-10-13T19:00:00-06:00") };
    const { m, deps, calls, marks } = setup(now);
    assert.equal(await tick(deps), "sent");
    assert.equal(m.pending()?.name, "A");
    assert.match(String(calls[0]!.body.text), /^📍 1 de 15/);
    assert.equal(await tick(deps), "pendiente");

    const r1 = await onCallbackQuery(deps, cq(`drip:skip:${m.pending()!.k}`));
    assert.equal(r1.label, "⏭️ Saltado");
    assert.ok(calls.some((c) => c.method === "answerCallbackQuery"));
    assert.ok(calls.some((c) => c.method === "editMessageReplyMarkup"));
    assert.equal(m.pending()?.name, "B"); // skip sends the next one right away; PBX skipped
    assert.ok(m.dnc.has("3338274500"));

    await onCallbackQuery(deps, cq(`drip:ok:${m.pending()!.k}`));
    assert.deepEqual(marks.slice(-1), ["contactado"]);
    assert.equal(m.pending(), null); // ok waits 4–6 min
    now.t = new Date(now.t.getTime() + 3 * 60_000);
    assert.equal(await tick(deps), "espera");
    now.t = new Date(now.t.getTime() + 3 * 60_000);
    assert.equal(await tick(deps), "sent");
    assert.match(String(calls.at(-1)!.body.text), /^📍 2 de 15/);
    const r3 = await onCallbackQuery(deps, cq(`drip:nowa:${m.pending()!.k}`));
    assert.equal(r3.label, "📵 Sin WhatsApp");
    assert.equal(marks.at(-1), "descartado");
    assert.ok(m.dnc.has("5546829132"));

    now.t = new Date("2026-10-13T20:01:00-06:00");
    assert.equal(await tick(deps), "recap");
    assert.match(String(calls.at(-1)!.body.text), /Goteo de hoy terminado: 1/);
  });
  it("ignores strangers and stale buttons; pending persists across days", async () => {
    const now = { t: new Date("2026-10-13T19:50:00-06:00") };
    const { m, deps } = setup(now);
    await tick(deps);
    const k = m.pending()!.k;
    assert.equal((await onCallbackQuery(deps, cq(`drip:ok:${k}`, 123))).label, null);
    assert.equal((await onCallbackQuery(deps, cq("drip:ok:1111111111"))).label, null);
    now.t = new Date("2026-10-14T11:30:00-06:00");
    assert.equal(await tick(deps), "pendiente");
    assert.equal(m.pending()?.k, k);
  });
  it("commands", async () => {
    const now = { t: new Date("2026-10-13T12:00:00-06:00") };
    const { m, deps } = setup(now);
    assert.match(String(await handleCommand(deps, OWNER, "/pausa")), /pausa/);
    assert.equal(await tick(deps), "pausado");
    await handleCommand(deps, OWNER, "/reanudar");
    assert.equal(m.state.paused, false);
    assert.equal(await handleCommand(deps, OWNER, "/mas"), null);
    assert.match(String(await handleCommand(deps, OWNER, "/mas")), /Primero marca/);
    assert.match(String(await handleCommand(deps, OWNER, "/estado")), /0 de 15/);
    assert.equal(await handleCommand(deps, 999, "/pausa"), null);
  });
});
