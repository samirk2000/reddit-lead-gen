/**
 * Telegram drip ("goteo") — pure logic, port of torioweb-wa-notifier/drip.mjs.
 * Nothing here talks to WhatsApp: it only builds wa.me links for Arnold to send by hand.
 */
import type { DigestBusiness } from "@/lib/maps/digest";

export const DRIP_OWNER_CHAT = "6322691345";
export const DRIP_TZ = "America/Mexico_City";
export const DRIP_START_HOUR = 11;
export const DRIP_END_HOUR = 20;
export const DRIP_MIN_GAP_MS = 4 * 60_000;
export const DRIP_QUOTA_START = "2026-10-13";

export type LocalTime = { date: string; hour: number; minute: number; dow: string };

export function localTime(now: Date = new Date()): LocalTime {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DRIP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), dow: String(p.weekday) };
}

/** Mon–Sat days in (a, b]. */
export function sendDaysBetween(a: string, b: string): number {
  let n = 0;
  const d = new Date(`${a}T12:00:00Z`);
  const e = new Date(`${b}T12:00:00Z`);
  while (d < e) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) n++; }
  return n;
}

/** 15 on the first day, +1 per Mon–Sat day, capped at 20. */
export function quotaFor(date: string): number {
  if (date <= DRIP_QUOTA_START) return 15;
  return Math.min(20, 15 + sendDaysBetween(DRIP_QUOTA_START, date));
}

export const key10 = (d: unknown): string => String(d ?? "").replace(/\D/g, "").slice(-10);

export function normalizeMx(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) d = `52${d}`;
  if (d.startsWith("52") && d.length === 12) d = `521${d.slice(2)}`;
  return /^521\d{10}$/.test(d) ? d : null;
}

/**
 * Mexico has no fixed/mobile split in numbering (libphonenumber says FIXED_LINE_OR_MOBILE),
 * so only obvious switchboard patterns are filtered: ending in 00, or a run like 5555-0000.
 */
export function likelyLandline(phone: unknown): string | null {
  const n = key10(phone);
  if (n.length !== 10) return null;
  if (/00$/.test(n)) return "parece conmutador (termina en 00)";
  if (/^(\d)\1{3}/.test(n.slice(2))) return "parece conmutador";
  return null;
}

const GREET = ["Hola", "Buen día", "Qué tal, buen día", "Hola, buen día"];
const INTRO = ["le escribo de Torio Web.", "le escribo de Torio Web:", "le saludo de Torio Web."];
const PRAISE = ["¡muy buena reputación!", "¡muy buena reputación!", "¡excelente reputación!", "muy buena reputación."];

export function varyOpener(text: string, rnd: () => number = Math.random): string {
  const pick = (a: string[]): string => a[Math.floor(rnd() * a.length)] ?? a[0] ?? "";
  let t = text.trim();
  t = t.replace(/^Hola,\s*le escribo de Torio Web\./, `${pick(GREET)}, ${pick(INTRO)}`);
  t = t.replace("¡muy buena reputación!", pick(PRAISE));
  if (rnd() < 0.5) t = t.replace("Noté que no tiene", "Vi que no tiene");
  if (rnd() < 0.5) t = t.replace(" en Google antes de contratar.", " en Google antes de contratar a alguien.");
  return t;
}

export function openerFrom(b: Pick<DigestBusiness, "wa_link" | "apertura">): string | null {
  try { const t = new URL(b.wa_link).searchParams.get("text"); if (t) return t; } catch { /* ignore */ }
  return b.apertura || null;
}

export const esc = (x: unknown): string =>
  String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatBusiness(b: DigestBusiness, text: string, n: number, q: number, manual = false): string {
  let num = String(b.phone ?? "").replace(/\D/g, "");
  try { num = new URL(b.wa_link).pathname.replace(/\D/g, "") || num; } catch { /* ignore */ }
  const wa = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  const rating = b.rating ? ` · ⭐ ${b.rating} (${b.reviews ?? 0} reseñas)` : "";
  return `📍 ${n} de ${q}${manual ? " ➕" : ""}\n<b>${esc(b.name)}</b>\n${esc(b.giro)} · ${esc(b.city)}${rating}\n\n` +
    `<a href="${esc(wa)}">👉 Abrir WhatsApp</a> · <a href="${esc(b.maps_url)}">Ver en Maps</a>`;
}

export function dripKeyboard(k: string) {
  return {
    inline_keyboard: [
      [{ text: "✅ Ya lo mandé", callback_data: `drip:ok:${k}` }, { text: "⏭️ Saltar", callback_data: `drip:skip:${k}` }],
      [{ text: "📵 No tiene WhatsApp", callback_data: `drip:nowa:${k}` }],
    ],
  };
}

export type DripEntry = { k: string; name: string; city?: string; at: number; why?: string };
export type DripPending = {
  k: string; name: string; city: string; giro: string; phone: string; place_id: string;
  date: string; n: number; q: number; at: number; message_id: number | null;
};
export type DripDay = { date: string; sent: DripEntry[]; user_skipped: DripEntry[]; skipped: DripEntry[]; recap_sent: boolean };
export type DripState = { paused: boolean; pending: DripPending | null; last_action_at: number; next_at: number };

export type TickDecision =
  | { action: "none"; reason: string }
  | { action: "recap"; reason: string }
  | { action: "send" };

/** Same gates as drip.mjs tick(): Mon–Sat, 11–20 CDMX, nothing pending, gap, quota, not paused. */
export function decideTick(state: DripState, day: DripDay, now: Date): TickDecision {
  const l = localTime(now);
  if (l.dow === "Sun") return { action: "none", reason: "domingo" };
  if (!day.recap_sent && day.sent.length > 0 && l.hour >= DRIP_END_HOUR) return { action: "recap", reason: "fin del día" };
  if (state.pending) return { action: "none", reason: "pendiente" };
  if (state.paused) return { action: "none", reason: "pausado" };
  if (l.hour < DRIP_START_HOUR || l.hour >= DRIP_END_HOUR) return { action: "none", reason: "fuera de horario" };
  if (day.recap_sent) return { action: "none", reason: "resumen ya enviado" };
  if (day.sent.length >= quotaFor(l.date)) return day.sent.length ? { action: "recap", reason: "" } : { action: "none", reason: "cuota" };
  const t = now.getTime();
  if (t < state.next_at || t - state.last_action_at < DRIP_MIN_GAP_MS) return { action: "none", reason: "espera" };
  return { action: "send" };
}

export type CallbackKind = "ok" | "skip" | "nowa";
export function parseCallback(data: unknown): { kind: CallbackKind; k: string } | null {
  const m = /^drip:(ok|skip|nowa):(\d+)$/.exec(String(data ?? ""));
  return m && m[1] && m[2] ? { kind: m[1] as CallbackKind, k: m[2] } : null;
}

export const jitterMs = (rnd: () => number = Math.random) => (4 + rnd() * 2) * 60_000;

export function recapText(day: DripDay, pending: DripPending | null, reason = ""): string {
  const lines = day.sent.map((s, i) => `${i + 1}. ${s.name} (${s.city ?? ""})`).join("\n");
  return esc(`✅ Goteo de hoy terminado: ${day.sent.length} negocios${reason ? ` (${reason})` : ""}\n${lines}\n` +
    `Saltados: ${day.user_skipped.length} · Omitidos: ${day.skipped.length}` +
    `${pending ? `\n⏳ Pendiente de marcar: ${pending.name}` : ""}\nCuando alguien conteste te aviso aquí.`);
}

export function statusText(state: DripState, day: DripDay): string {
  return `📍 ${day.sent.length} de ${quotaFor(day.date)} enviados hoy (${day.date}). Saltados: ${day.user_skipped.length} · Omitidos: ${day.skipped.length}.` +
    (state.pending ? `\n⏳ Pendiente de marcar: ${state.pending.name} (${state.pending.n} de ${state.pending.q})` : "") +
    `\n${state.paused ? "⏸ En pausa (usa /reanudar)" : `▶️ Activo, de lun a sáb de ${DRIP_START_HOUR}:00 a ${DRIP_END_HOUR}:00`}`;
}

export const DRIP_HELP =
  "🤖 Comandos del goteo de negocios:\n/estado – cuántos van hoy y cuántos faltan\n/mas – mándame el siguiente ya\n/pausa – detener el goteo (hasta /reanudar)\n/reanudar – reanudar el goteo\n/ayuda – esta ayuda";
