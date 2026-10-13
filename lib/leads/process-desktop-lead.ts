import { analyzeRedditPost } from "@/lib/ai/gemini";
import { telegramAlertMinScore } from "@/lib/config/runtime";
import type { DesktopLead } from "@/lib/leads/desktop-lead";
import { resolveSalesCta } from "@/lib/sales/brand";
import { sendTelegramLeadNotification } from "@/lib/telegram/bot";
import type { SupabaseServiceClient } from "@/lib/supabase/service";
import type { LeadStatus } from "@/lib/supabase/types";

export type DesktopIngestSuccess = {
  ok: true;
  duplicate: boolean;
  id: string;
  url: string;
  intent_score: number | null;
  alerted: boolean;
  status: string;
  warning?: string;
};

export type DesktopIngestFailure = {
  ok: false;
  error: string;
  status: number;
};

export async function processDesktopLead(
  supabase: SupabaseServiceClient,
  userId: string,
  lead: DesktopLead,
): Promise<DesktopIngestSuccess | DesktopIngestFailure> {
  const existing = await findExisting(supabase, userId, lead);
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      id: existing.id,
      url: lead.url,
      intent_score: existing.intent_score,
      alerted: false,
      status: existing.status,
    };
  }

  const settings = await loadSettings(supabase, userId);
  const apiKey =
    settings.gemini_api_key?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "Falta GEMINI_API_KEY en el servidor o en Ajustes.",
    };
  }
  const keywordPhrase = lead.keywords[0]?.trim() || "busco iptv";
  const keywordId = await matchKeywordId(supabase, userId, lead.keywords);

  let analysis;
  try {
    analysis = await analyzeRedditPost(
      lead.title,
      promptContent(lead),
      keywordPhrase,
      {
        userApiKey: apiKey,
        channel: "reddit",
        salesCta: resolveSalesCta({
          whatsappNumber: settings.whatsapp_number,
          whatsappUrl: settings.whatsapp_url,
          websiteUrl: settings.website_url,
          businessName: settings.business_name,
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[leads/ingest] gemini failed", {
      url: lead.url,
      message: message.slice(0, 300),
    });
    const rateLimited = /429|rate limit/i.test(message);
    return {
      ok: false,
      status: rateLimited ? 503 : 502,
      error: rateLimited
        ? "Gemini está saturado. Reintenta este lead en un minuto."
        : "No se pudo calificar el lead con Gemini. No se guardó.",
    };
  }

  const score = clampScore(analysis.intent_score);
  const minScore = telegramAlertMinScore();
  const status: LeadStatus = score >= minScore ? "notified" : score <= 3 ? "rejected" : "archived";

  const { data, error } = await supabase
    .from("detected_leads")
    .insert({
      user_id: userId,
      keyword_id: keywordId,
      reddit_post_id: lead.reddit_post_id,
      title: lead.title,
      content: lead.body || null,
      author: lead.author,
      post_url: lead.url,
      subreddit: lead.subreddit,
      intent_score: score,
      analysis_reasoning: analysis.analysis_reasoning,
      suggested_reply: analysis.suggested_reply,
      suggested_reply_wa: analysis.suggested_reply_wa,
      status,
    })
    .select()
    .single();

  if (error || !data) {
    if (error && isUniqueViolation(error.code, error.message)) {
      const raced = await findExisting(supabase, userId, lead);
      if (raced) {
        return {
          ok: true,
          duplicate: true,
          id: raced.id,
          url: lead.url,
          intent_score: raced.intent_score,
          alerted: false,
          status: raced.status,
        };
      }
    }
    console.error("[leads/ingest] insert failed", {
      code: error?.code,
      message: error?.message,
      url: lead.url,
    });
    return {
      ok: false,
      status: 500,
      error: "No se pudo guardar el lead en Supabase.",
    };
  }

  let alerted = false;
  let warning: string | undefined;
  if (status === "notified") {
    const token =
      settings.telegram_bot_token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
    const chatId =
      settings.telegram_chat_id?.trim() || process.env.TELEGRAM_CHAT_ID?.trim() || "";
    if (!token || !chatId) {
      warning =
        "Lead guardado. No hay Telegram (token o chat id) y no se envió alerta.";
      console.warn("[leads/ingest] telegram missing", { userId });
    } else {
      try {
        await sendTelegramLeadNotification(token, chatId, data, keywordPhrase);
        alerted = true;
      } catch (telegramError) {
        const message =
          telegramError instanceof Error ? telegramError.message : String(telegramError);
        console.error("[leads/ingest] telegram failed", {
          message: message.slice(0, 300),
          leadId: data.id,
        });
        warning = "Lead guardado, pero Telegram no aceptó la alerta.";
      }
    }
  }

  const success: DesktopIngestSuccess = {
    ok: true,
    duplicate: false,
    id: data.id,
    url: lead.url,
    intent_score: score,
    alerted,
    status,
  };
  if (warning) success.warning = warning;
  return success;
}

function promptContent(lead: DesktopLead): string {
  const lines = [
    lead.body || "(sin texto)",
    "",
    `Tipo: ${lead.kind === "comment" ? "comentario" : "publicación"}.`,
    `Subreddit: r/${lead.subreddit}.`,
    `Fecha del post: ${lead.created_at}.`,
  ];
  if (lead.author) lines.push(`Autor: ${lead.author}.`);
  if (lead.keywords.length > 0) {
    lines.push(`Frases que marcó el buscador de Windows: ${lead.keywords.join(", ")}.`);
  }
  if (lead.local_score != null) {
    lines.push(
      `Pista local del buscador (no es la calificación final): ${lead.local_score}/10.`,
    );
  }
  return lines.join("\n");
}

function clampScore(value: number): number {
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 10) return 10;
  return rounded;
}

type ExistingLead = {
  id: string;
  intent_score: number | null;
  status: string;
};

async function findExisting(
  supabase: SupabaseServiceClient,
  userId: string,
  lead: DesktopLead,
): Promise<ExistingLead | null> {
  const byUrl = await supabase
    .from("detected_leads")
    .select("id, intent_score, status")
    .eq("user_id", userId)
    .eq("post_url", lead.url)
    .maybeSingle();

  if (byUrl.error) {
    throw new Error(`[leads/ingest] dedupe por url: ${byUrl.error.message}`);
  }
  if (byUrl.data) return byUrl.data;

  const byId = await supabase
    .from("detected_leads")
    .select("id, intent_score, status")
    .eq("user_id", userId)
    .eq("reddit_post_id", lead.reddit_post_id)
    .maybeSingle();

  if (byId.error) {
    throw new Error(`[leads/ingest] dedupe por id: ${byId.error.message}`);
  }
  return byId.data;
}

async function matchKeywordId(
  supabase: SupabaseServiceClient,
  userId: string,
  keywords: string[],
): Promise<string | null> {
  if (keywords.length === 0) return null;
  const wanted = new Set(keywords.map((phrase) => phrase.toLowerCase()));
  const { data, error } = await supabase
    .from("keywords")
    .select("id, phrase")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.error("[leads/ingest] keywords lookup failed", { message: error.message });
    return null;
  }

  const match = (data ?? []).find((row) => wanted.has(row.phrase.trim().toLowerCase()));
  return match?.id ?? null;
}

type IngestSettings = {
  gemini_api_key: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  whatsapp_number: string | null;
  whatsapp_url: string | null;
  website_url: string | null;
  business_name: string | null;
};

async function loadSettings(
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<IngestSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "gemini_api_key, telegram_bot_token, telegram_chat_id, whatsapp_number, whatsapp_url, website_url, business_name",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`[leads/ingest] settings: ${error.message}`);
  }

  return {
    gemini_api_key: data?.gemini_api_key ?? null,
    telegram_bot_token: data?.telegram_bot_token ?? null,
    telegram_chat_id: data?.telegram_chat_id ?? null,
    whatsapp_number: data?.whatsapp_number ?? null,
    whatsapp_url: data?.whatsapp_url ?? null,
    website_url: data?.website_url ?? null,
    business_name: data?.business_name ?? null,
  };
}

function isUniqueViolation(code: string | undefined, message: string): boolean {
  return code === "23505" || /duplicate key/i.test(message);
}
