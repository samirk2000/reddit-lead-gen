/** Telegram drip engine: shared by the cron tick and the Telegram webhook. */
import type { DigestBusiness } from "@/lib/maps/digest";
import { isNotariaBusiness } from "../maps/notaria";
import {
  DRIP_HELP, DRIP_OWNER_CHAT, decideTick, dripKeyboard, formatBusiness, jitterMs, key10,
  likelyLandline, localTime, normalizeMx, openerFrom, parseCallback, quotaFor, recapText,
  statusText, varyOpener, type DripDay, type DripState,
} from "./core";

export type DripStore = {
  /** Loads state with an opaque version for optimistic locking. */
  loadState(): Promise<{ state: DripState; version: number }>;
  /** Returns false when someone else saved first (version changed). */
  saveState(state: DripState, version: number): Promise<boolean>;
  loadDay(date: string): Promise<DripDay>;
  saveDay(day: DripDay): Promise<void>;
  /** Phone keys (last 10 digits) that must never be offered again. */
  isBlocked(k: string, placeId: string): Promise<string | null>;
  block(k: string, reason: string): Promise<void>;
};

export type DripDeps = {
  store: DripStore;
  fetchList: () => Promise<DigestBusiness[]>;
  markStatus: (b: { place_id?: string; phone?: string; name?: string }, status: "contactado" | "descartado") => Promise<void>;
  tg: (method: string, body: Record<string, unknown>) => Promise<{ message_id?: number } | null>;
  now?: () => Date;
  rnd?: () => number;
  log?: (...a: unknown[]) => void;
};

const html = (text: string, extra: Record<string, unknown> = {}) => ({
  chat_id: DRIP_OWNER_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra,
});

async function nextBusiness(d: DripDeps, day: DripDay, state: DripState): Promise<DigestBusiness | null> {
  const log = d.log ?? console.log;
  for (const b of await d.fetchList()) {
    const k = key10(b.phone);
    const seen = [...day.sent, ...day.skipped, ...day.user_skipped];
    if (seen.some((s) => s.k === k) || state.pending?.k === k) continue;
    const skip = (why: string) => { day.skipped.push({ k, name: b.name, at: (d.now ?? (() => new Date()))().getTime(), why }); log(`[drip] omitido ${b.name}: ${why}`); };
    if (isNotariaBusiness({ name: b.name, giro: b.giro })) { skip("notaría"); continue; }
    if (!normalizeMx(b.phone)) { skip("número inválido"); continue; }
    const blocked = await d.store.isBlocked(k, b.place_id);
    if (blocked) { skip(blocked); continue; }
    if (!openerFrom(b)) { skip("sin texto de apertura"); continue; }
    const lw = likelyLandline(b.phone);
    if (lw) {
      skip(lw);
      await d.store.block(k, `sin WhatsApp: ${lw}`);
      await d.markStatus(b, "descartado").catch(() => undefined);
      continue;
    }
    return b;
  }
  return null;
}

/** Offers the next business. Returns "pending" | "sent" | "empty" | "conflict". */
export async function sendNext(d: DripDeps, manual = false): Promise<"pending" | "sent" | "empty" | "conflict"> {
  const now = (d.now ?? (() => new Date()))();
  const { state, version } = await d.store.loadState();
  if (state.pending) return "pending";
  const date = localTime(now).date;
  const day = await d.store.loadDay(date);
  // Claim first so a concurrent cron/webhook cannot double-send.
  const claim: DripState = { ...state, last_action_at: now.getTime(), next_at: now.getTime() + jitterMs(d.rnd) };
  if (!(await d.store.saveState(claim, version))) return "conflict";
  const b = await nextBusiness(d, day, state);
  await d.store.saveDay(day);
  if (!b) return "empty";
  const k = key10(b.phone);
  const n = day.sent.length + 1;
  const q = quotaFor(date);
  const msg = await d.tg("sendMessage", html(formatBusiness(b, varyOpener(openerFrom(b) ?? "", d.rnd), n, q, manual), { reply_markup: dripKeyboard(k) }));
  const after = await d.store.loadState();
  await d.store.saveState({
    ...after.state,
    pending: { k, name: b.name, city: b.city, giro: b.giro, phone: b.phone, place_id: b.place_id, date, n, q, at: now.getTime(), message_id: msg?.message_id ?? null },
    last_action_at: now.getTime(), next_at: 0,
  }, after.version);
  return "sent";
}

export async function recap(d: DripDeps, date: string, reason = ""): Promise<void> {
  const day = await d.store.loadDay(date);
  if (day.recap_sent) return;
  day.recap_sent = true;
  await d.store.saveDay(day);
  const { state } = await d.store.loadState();
  await d.tg("sendMessage", html(recapText(day, state.pending, reason)));
}

export async function tick(d: DripDeps): Promise<string> {
  const now = (d.now ?? (() => new Date()))();
  const { state } = await d.store.loadState();
  const l = localTime(now);
  const day = await d.store.loadDay(l.date);
  const decision = decideTick(state, day, now);
  if (decision.action === "recap") { await recap(d, l.date, decision.reason); return "recap"; }
  if (decision.action === "none") return decision.reason;
  const r = await sendNext(d);
  if (r === "empty") { await recap(d, l.date, "se acabó la lista"); return "empty"; }
  return r;
}

export type CallbackResult = { answer: string | null; label: string | null };

export async function handleCallback(d: DripDeps, chatId: unknown, fromId: unknown, data: unknown): Promise<CallbackResult> {
  if (String(chatId) !== DRIP_OWNER_CHAT || String(fromId) !== DRIP_OWNER_CHAT) return { answer: null, label: null };
  const cb = parseCallback(data);
  if (!cb) return { answer: "Ya estaba marcado", label: null };
  const { state, version } = await d.store.loadState();
  const p = state.pending;
  if (!p || p.k !== cb.k) return { answer: "Ese ya estaba marcado", label: null };
  const now = (d.now ?? (() => new Date()))().getTime();
  const date = localTime(new Date(now)).date;
  // ✅ waits 4–6 min; ⏭️/📵 send the next one right away.
  const next: DripState = cb.kind === "ok"
    ? { ...state, pending: null, last_action_at: now, next_at: now + jitterMs(d.rnd) }
    : { ...state, pending: null, last_action_at: 0, next_at: 0 };
  if (!(await d.store.saveState(next, version))) return { answer: "Ese ya estaba marcado", label: null };
  const day = await d.store.loadDay(date);
  if (cb.kind === "ok") {
    day.sent.push({ k: p.k, name: p.name, city: p.city, at: now });
    await d.store.block(p.k, "contactado");
    await d.markStatus(p, "contactado").catch((e) => (d.log ?? console.log)("[drip] mark-status falló", e));
  } else if (cb.kind === "nowa") {
    day.user_skipped.push({ k: p.k, name: p.name, at: now, why: "sin WhatsApp" });
    await d.store.block(p.k, "sin WhatsApp (marcado por Arnold)");
    await d.markStatus(p, "descartado").catch((e) => (d.log ?? console.log)("[drip] mark-status falló", e));
  } else {
    day.user_skipped.push({ k: p.k, name: p.name, at: now });
  }
  await d.store.saveDay(day);
  if (cb.kind !== "ok") await sendNext(d).catch((e) => (d.log ?? console.log)("[drip] siguiente inmediato falló", e));
  if (cb.kind === "ok") return { answer: `✅ Listo, ${day.sent.length} de ${quotaFor(date)}`, label: "✅ Enviado" };
  if (cb.kind === "nowa") return { answer: "📵 Anotado, no vuelve a salir", label: "📵 Sin WhatsApp" };
  return { answer: "⏭️ Saltado", label: "⏭️ Saltado" };
}

/** Full webhook path for a callback_query: handle, answer, edit keyboard. */
export async function onCallbackQuery(d: DripDeps, cq: { id: string; data?: string; from?: { id?: number }; message?: { message_id: number; chat: { id: number } } }): Promise<CallbackResult> {
  const chat = cq.message?.chat?.id;
  const r = await handleCallback(d, chat, cq.from?.id, cq.data);
  await d.tg("answerCallbackQuery", { callback_query_id: cq.id, ...(r.answer ? { text: r.answer } : {}) }).catch(() => null);
  if (r.label && cq.message) {
    await d.tg("editMessageReplyMarkup", { chat_id: chat, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: r.label, callback_data: "drip:done" }]] } }).catch(() => null);
  }
  return r;
}

export async function handleCommand(d: DripDeps, chatId: unknown, text: unknown): Promise<string | null> {
  if (String(chatId) !== DRIP_OWNER_CHAT) return null;
  const raw = String(text ?? "").trim();
  const cmd = (raw.split(/[\s@]/)[0] ?? "").toLowerCase();
  const date = localTime((d.now ?? (() => new Date()))()).date;
  const setPaused = async (paused: boolean) => {
    for (let i = 0; i < 3; i++) { const { state, version } = await d.store.loadState(); if (await d.store.saveState({ ...state, paused }, version)) return; }
  };
  switch (cmd) {
    case "/pausa": await setPaused(true); return "⏸ Goteo en pausa. Escribe /reanudar para seguir.";
    case "/reanudar": case "/sigue": await setPaused(false); return "▶️ Goteo reanudado.";
    case "/estado": case "/hoy": { const { state } = await d.store.loadState(); return statusText(state, await d.store.loadDay(date)); }
    case "/mas": {
      const r = await sendNext(d, true);
      if (r === "pending") return "Primero marca el anterior ✅, ⏭️ o 📵";
      if (r === "conflict") return "⏳ Espera tantito, estoy mandando uno.";
      return r === "empty" ? "📭 Ya no quedan negocios en la lista de hoy." : null;
    }
    case "/ayuda": case "/start": case "/help": return DRIP_HELP;
    default: return raw.startsWith("/") ? `No conozco ese comando.\n\n${DRIP_HELP}` : null;
  }
}
