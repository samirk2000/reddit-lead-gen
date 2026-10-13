import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { DRIP_OWNER_CHAT } from "@/lib/drip/core";
import { handleCommand, onCallbackQuery } from "@/lib/drip/engine";
import { createLiveDripDeps, telegramApi } from "@/lib/drip/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function secretMatches(got: string | null, expected: string): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(got); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Telegram webhook for the drip bot. Register with setWebhook(secret_token=TELEGRAM_WEBHOOK_SECRET,
 * allowed_updates=["message","callback_query"]). Only chat 6322691345 is served.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected) return NextResponse.json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET no está configurado." }, { status: 500 });
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: Record<string, any>;
  try { update = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  try {
    if (update?.callback_query) {
      const cq = update.callback_query;
      if (String(cq.message?.chat?.id) !== DRIP_OWNER_CHAT || String(cq.from?.id) !== DRIP_OWNER_CHAT) {
        await telegramApi("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => null);
        return NextResponse.json({ ok: true });
      }
      const deps = await createLiveDripDeps(request.nextUrl.origin);
      await onCallbackQuery(deps, cq);
      return NextResponse.json({ ok: true });
    }
    const m = update?.message;
    if (m?.text && String(m.chat?.id) === DRIP_OWNER_CHAT) {
      const deps = await createLiveDripDeps(request.nextUrl.origin);
      const reply = await handleCommand(deps, m.chat.id, m.text);
      if (reply) await deps.tg("sendMessage", { chat_id: DRIP_OWNER_CHAT, text: reply, disable_web_page_preview: true });
    }
  } catch (error) {
    console.error("[drip] webhook", error instanceof Error ? error.message : error);
  }
  // Always 200 so Telegram does not retry forever.
  return NextResponse.json({ ok: true });
}
