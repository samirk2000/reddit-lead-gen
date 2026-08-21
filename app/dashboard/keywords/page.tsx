import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import { KeywordsManager } from "@/components/dashboard/keywords-manager";
import { DEFAULT_SUBREDDITS } from "@/lib/reddit/fetcher";

export const metadata: Metadata = {
  title: "Keywords",
};

export default async function KeywordsPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data } = await supabase
    .from("keywords")
    .select("id, phrase, subreddit, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const keywords = (data ?? []).map((k) => ({
    id: k.id,
    phrase: k.phrase,
    subreddit: k.subreddit,
    is_active: k.is_active,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Keywords
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Define qué frases monitorear en Reddit y en qué subreddits.
      </p>

      <KeywordsManager
        keywords={keywords}
        defaultSubreddits={[...DEFAULT_SUBREDDITS]}
      />
    </div>
  );
}
