import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import { MetricCards } from "@/components/dashboard/metric-cards";
import { LeadList, type LeadView } from "@/components/dashboard/lead-list";
import { RunScanButton } from "@/components/dashboard/run-scan-button";

export const metadata: Metadata = {
  title: "Leads",
};

export default async function DashboardPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data } = await supabase
    .from("detected_leads")
    .select(
      "id, reddit_post_id, title, subreddit, post_url, intent_score, analysis_reasoning, suggested_reply, status, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  const leads: LeadView[] = (data ?? []).map((lead) => ({
    id: lead.id,
    reddit_post_id: lead.reddit_post_id,
    title: lead.title,
    subreddit: lead.subreddit,
    post_url: lead.post_url,
    intent_score: lead.intent_score,
    analysis_reasoning: lead.analysis_reasoning,
    suggested_reply: lead.suggested_reply,
    status: lead.status,
    created_at: lead.created_at,
  }));

  const highIntent = leads.filter(
    (lead) => lead.intent_score !== null && lead.intent_score >= 8,
  ).length;
  const pending = leads.filter(
    (lead) => lead.status === "notified" || lead.status === "new",
  ).length;

  const metrics = {
    total: leads.length,
    highIntent,
    pending,
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Oportunidades detectadas por la automatización de Reddit.
          </p>
        </div>
        <RunScanButton />
      </div>

      <div className="mt-6">
        <MetricCards metrics={metrics} />
      </div>

      <LeadList leads={leads} />
    </div>
  );
}
