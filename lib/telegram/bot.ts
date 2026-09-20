import type { DetectedLead } from "@/lib/supabase/types";
import { detectLeadChannel, channelLabel } from "@/lib/leads/channel";

/**
 * Telegram notification helpers.
 */

type TelegramSendMessageOk = {
  ok: true;
};

export async function sendTelegramLeadNotification(
  botToken: string,
  chatId: string,
  lead: DetectedLead,
  keyword: string,
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(
    botToken,
  )}/sendMessage`;

  const text = buildLeadMessage(lead, keyword);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Telegram API returned ${response.status} for chat ${chatId}: ${
        body.slice(0, 500) || "(empty body)"
      }`,
    );
  }

  const payload = (await response.json()) as TelegramSendMessageOk | null;
  if (!payload || payload.ok !== true) {
    throw new Error(
      `Telegram API returned an unexpected response for chat ${chatId}.`,
    );
  }

  return true;
}

function buildLeadMessage(lead: DetectedLead, keyword: string): string {
  const channel = detectLeadChannel(lead);
  const title = escapeHtml(lead.title);
  const reasoning = escapeHtml(lead.analysis_reasoning ?? "Sin análisis.");
  const replyPublic = escapeHtml(lead.suggested_reply ?? "Sin sugerencia.");
  const replyWa = escapeHtml(lead.suggested_reply_wa ?? "—");
  const score = lead.intent_score ?? 0;
  const source =
    channel === "quora"
      ? "Quora"
      : `r/${escapeHtml(lead.subreddit)}`;
  const viewLabel =
    channel === "quora" ? "Ver en Quora" : "Ver en Reddit";

  return [
    `🎯 <b>Nuevo lead</b> (Score: ${score}/10) · ${channelLabel(channel)}`,
    `📌 <b>Fuente:</b> ${source} | <b>Keyword:</b> ${escapeHtml(keyword)}`,
    `📝 <b>Título:</b> ${title}`,
    `💡 <b>Análisis:</b> ${reasoning}`,
    `💬 <b>Respuesta pública:</b> ${replyPublic}`,
    `📱 <b>Follow-up WA:</b> ${replyWa}`,
    `🔗 <a href="${escapeHtml(lead.post_url)}">${viewLabel}</a>`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
