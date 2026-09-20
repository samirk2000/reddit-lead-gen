import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import { MetricCards } from "@/components/dashboard/metric-cards";
import { LeadList, type LeadView } from "@/components/dashboard/lead-list";
import { ProgressiveScanPanel } from "@/components/dashboard/progressive-scan-panel";
import { resolveSalesCta } from "@/lib/sales/brand";

export const metadata: Metadata = {
  title: "Leads",
};

export default async function DashboardPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data } = await supabase
    .from("detected_leads")
    .select(
      "id, reddit_post_id, title, subreddit, post_url, intent_score, analysis_reasoning, suggested_reply, suggested_reply_wa, follow_up_at, status, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: settings } = await supabase
    .from("user_settings")
    .select("whatsapp_number, whatsapp_url, website_url, business_name")
    .eq("id", userId)
    .maybeSingle();

  const salesCta = resolveSalesCta({
    whatsappNumber: settings?.whatsapp_number,
    whatsappUrl: settings?.whatsapp_url,
    websiteUrl: settings?.website_url,
    businessName: settings?.business_name,
  });

  const leads: LeadView[] = (data ?? []).map((lead) => ({
    id: lead.id,
    reddit_post_id: lead.reddit_post_id,
    title: lead.title,
    subreddit: lead.subreddit,
    post_url: lead.post_url,
    intent_score: lead.intent_score,
    analysis_reasoning: lead.analysis_reasoning,
    suggested_reply: lead.suggested_reply,
    suggested_reply_wa: lead.suggested_reply_wa ?? null,
    follow_up_at: lead.follow_up_at ?? null,
    status: lead.status,
    created_at: lead.created_at,
  }));

  const highIntent = leads.filter(
    (lead) => lead.intent_score !== null && lead.intent_score >= 8,
  ).length;
  const pending = leads.filter(
    (lead) =>
      (lead.status === "notified" || lead.status === "new") &&
      (!lead.follow_up_at || new Date(lead.follow_up_at).getTime() <= Date.now()),
  ).length;

  const metrics = {
    total: leads.length,
    highIntent,
    pending,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Leads
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos = pendientes. Copiá respuesta pública (sin WA) o follow-up
          WhatsApp. Escaneá Reddit/Quora por separado.
        </p>
      </div>

      <div className="mt-6">
        <ProgressiveScanPanel />
      </div>

      <div className="mt-6">
        <MetricCards metrics={metrics} />
      </div>

      <LeadList
        leads={leads}
        salesCta={{
          whatsappNumber: salesCta.whatsappNumber ?? null,
          whatsappUrl: salesCta.whatsappUrl ?? null,
          websiteUrl: salesCta.websiteUrl ?? null,
        }}
      />
    </div>
  );
}
