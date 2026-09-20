/** Shared scan stream types (safe to import from client components). */

export type ScanMode = "reddit" | "quora";

export type ScanLeadPreview = {
  id: string;
  title: string;
  subreddit: string;
  post_url: string;
  intent_score: number | null;
  status: string;
  suggested_reply: string | null;
};

export type PipelineSummaryLite = {
  fetched: number;
  stored: number;
  alerted: number;
  skippedDedupe: number;
  skippedFilter: number;
};

export type ScanEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      current: number;
      total: number;
      label: string;
      phase: string;
    }
  | { type: "lead"; lead: ScanLeadPreview }
  | { type: "done"; summary: PipelineSummaryLite; paused: boolean }
  | { type: "error"; message: string };
