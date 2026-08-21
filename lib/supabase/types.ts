/**
 * Manual TypeScript definitions derived from the Supabase DB schema.
 *
 * These types are intentionally hand-written (per .cursorrules) rather than
 * generated, and are used as the `Database` generic when instantiating the
 * Supabase clients so all queries are type-checked against the real tables.
 *
 * NOTE: Row types are declared as object type aliases (not `interface`).
 * Interfaces lack an implicit index signature, so they are not assignable to
 * Supabase's internal `GenericTable.Row: Record<string, unknown>` constraint
 * and would degrade all row inference to `never`.
 */

// ---------------------------------------------------------------------------
// Enums (match Postgres enum columns)
// ---------------------------------------------------------------------------

/** Delivery status of a detected lead record. */
export type LeadStatus =
  | "new"
  | "notified"
  | "replied"
  | "archived"
  | "rejected";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Per-user configuration for the detection engine (`user_settings`). */
export type UserSettings = {
  id: string; // UUID references auth.users(id)
  telegram_chat_id: string | null;
  telegram_bot_token: string | null;
  gemini_api_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** A tracked keyword that the bot monitors on Reddit (`keywords`). */
export type Keyword = {
  id: string; // UUID
  user_id: string; // UUID
  phrase: string;
  subreddit: string; // Default 'all'
  is_active: boolean;
  created_at: string;
};

/** A detected Reddit lead associated with a matched keyword (`detected_leads`). */
export type DetectedLead = {
  id: string; // UUID
  user_id: string; // UUID
  keyword_id: string | null; // UUID
  reddit_post_id: string;
  title: string;
  content: string | null;
  author: string | null;
  post_url: string;
  subreddit: string;
  intent_score: number | null; // 1-10
  analysis_reasoning: string | null;
  suggested_reply: string | null;
  status: LeadStatus;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Database schema wrapper for the Supabase client generic
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      user_settings: {
        Row: UserSettings;
        Insert: Omit<UserSettings, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<UserSettings>;
        Relationships: [
          {
            foreignKeyName: "user_settings_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      keywords: {
        Row: Keyword;
        Insert: Omit<Keyword, "created_at" | "id"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Keyword>;
        Relationships: [
          {
            foreignKeyName: "keywords_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      detected_leads: {
        Row: DetectedLead;
        Insert: Omit<DetectedLead, "created_at" | "id"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<DetectedLead>;
        Relationships: [
          {
            foreignKeyName: "detected_leads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "detected_leads_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
