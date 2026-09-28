import type { Metadata } from "next";
import { cookies } from "next/headers";
import { RedditWebPanel } from "@/components/dashboard/reddit-web-panel";
import {
  MISSING_REDDIT_WEB_SCHEMA_MESSAGE,
  REDDIT_WEB_MANUAL_REPLY_REMINDER,
} from "@/lib/reddit-web/constants";
import {
  isMissingRedditWebSchema,
  redditWebDbErrorMessage,
} from "@/lib/reddit-web/errors";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import type { RedditWebLead } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leads de Reddit",
};

export default async function RedditWebLeadsPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data, error } = await supabase
    .from("reddit_web_leads")
    .select("*")
    .eq("user_id", userId)
    .order("inserted_at", { ascending: false })
    .order("created_utc", { ascending: false, nullsFirst: false })
    .limit(500);

  let loadError: string | null = null;
  let leads: RedditWebLead[] = [];
  if (error) {
    console.error("[reddit-web] list failed", {
      code: error.code,
      message: error.message,
    });
    loadError = isMissingRedditWebSchema(error)
      ? MISSING_REDDIT_WEB_SCHEMA_MESSAGE
      : redditWebDbErrorMessage(error);
  } else {
    leads = (data ?? []).map(normalizeLead);
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Leads de Reddit
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Publicaciones donde alguien pide una página web, una landing o una
          app de Roku. El bot las junta cada 2 horas y deja un borrador en
          español y otro en inglés.
        </p>
      </div>

      <p
        role="note"
        className="mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
      >
        {REDDIT_WEB_MANUAL_REPLY_REMINDER}
      </p>

      {loadError ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {loadError}
        </p>
      ) : null}

      <RedditWebPanel initialLeads={leads} schemaReady={loadError === null} />
    </div>
  );
}

function normalizeLead(lead: RedditWebLead): RedditWebLead {
  return {
    ...lead,
    id: String(lead.id),
    keywords: Array.isArray(lead.keywords)
      ? lead.keywords.filter((item) => typeof item === "string")
      : [],
    notas: typeof lead.notas === "string" ? lead.notas : "",
    score_intencion: coerceScore(lead.score_intencion),
  };
}

function coerceScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}
