import type { DetectedLead } from "@/lib/supabase/types";

/**
 * Telegram notification helpers.
 *
 * Sends structured lead alerts to a user's Telegram chat via the Bot API.
 */

/** Telegram Bot API response for a successful `sendMessage` call. */
type TelegramSendMessageOk = {
  ok: true;
};

/**
 * Sends a lead alert to the configured Telegram chat.
 *
 * @param botToken Telegram bot token (`{bot_id}:{auth_token}`).
 * @param chatId   Target chat id (user, group, or channel).
 * @param lead     The detected lead to report.
 * @param keyword  The keyword that triggered the lead.
 * @returns        Whether the message was accepted by the Bot API.
 * @throws         On network failure, non-OK response, or invalid payload.
 */
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

/**
 * Builds the HTML-formatted lead alert message.
 *
 * Only the 3 cosmetic emoji lines use `parse_mode`-safe markup; the rest are
 * single-line fields so Telegram's HTML parser won't choke on user content.
 */
function buildLeadMessage(lead: DetectedLead, keyword: string): string {
  const title = escapeHtml(lead.title);
  const reasoning = escapeHtml(lead.analysis_reasoning ?? "Sin análisis.");
  const reply = escapeHtml(lead.suggested_reply ?? "Sin sugerencia.");
  const score = lead.intent_score ?? 0;

  return [
    `🎯 <b>New Lead Detected!</b> (Score: ${score}/10)`,
    `📌 <b>Subreddit:</b> r/${escapeHtml(lead.subreddit)} | <b>Keyword:</b> ${escapeHtml(keyword)}`,
    `📝 <b>Title:</b> ${title}`,
    `💡 <b>AI Rationale:</b> ${reasoning}`,
    `💬 <b>Suggested Reply:</b> ${reply}`,
    `🔗 <a href="${escapeHtml(lead.post_url)}">View Post on Reddit</a>`,
  ].join("\n");
}

/** Escapes HTML special characters to keep Telegram's HTML parser safe. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
