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
  /** Digits for wa.me (e.g. 5215512345678). */
  whatsapp_number: string | null;
  /** WhatsApp Business click-to-chat URL (preferred). */
  whatsapp_url: string | null;
  /** Public landing / sales page URL. */
  website_url: string | null;
  /** Optional brand name used in soft intros. */
  business_name: string | null;
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

/** Pipeline status for a Google Maps prospect (`maps_leads`). */
export type MapsLeadStatus =
  | "nuevo"
  | "contactado"
  | "respondió"
  | "cerrado"
  | "descartado";

/** Why a Google place was kept as a prospect. */
export type MapsLeadReason = "sin_sitio" | "solo_red_social";

/** A local business with no real website (`maps_leads`). */
export type MapsLead = {
  id: string;
  user_id: string;
  place_id: string;
  name: string;
  address: string | null;
  phone_national: string | null;
  phone_international: string | null;
  whatsapp_e164: string | null;
  rating: number | null;
  user_rating_count: number | null;
  website_uri: string | null;
  google_maps_uri: string | null;
  business_status: string | null;
  specialty: string;
  city: string;
  lead_reason: MapsLeadReason;
  priority_score: number;
  status: MapsLeadStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

/** Per-user WhatsApp template for maps prospects (`maps_settings`). */
export type MapsSettings = {
  user_id: string;
  whatsapp_template: string;
  updated_at: string;
};

/** One successful Places search, for the hourly cost cap (`maps_search_log`). */
export type MapsSearchLog = {
  id: string;
  user_id: string;
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
  /** Public Quora/Reddit-safe reply. */
  suggested_reply: string | null;
  /** Operator WhatsApp/DM follow-up with sales CTA. */
  suggested_reply_wa: string | null;
  /** When set in the future, snoozed out of Todos. */
  follow_up_at: string | null;
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
        Insert: Omit<
          DetectedLead,
          "created_at" | "id" | "suggested_reply_wa" | "follow_up_at"
        > & {
          id?: string;
          created_at?: string;
          suggested_reply_wa?: string | null;
          follow_up_at?: string | null;
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
      maps_leads: {
        Row: MapsLead;
        Insert: Omit<
          MapsLead,
          | "id"
          | "created_at"
          | "updated_at"
          | "last_seen_at"
          | "status"
          | "notes"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
          status?: MapsLeadStatus;
          notes?: string;
        };
        Update: Partial<MapsLead>;
        Relationships: [
          {
            foreignKeyName: "maps_leads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      maps_settings: {
        Row: MapsSettings;
        Insert: Omit<MapsSettings, "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<MapsSettings>;
        Relationships: [
          {
            foreignKeyName: "maps_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      maps_search_log: {
        Row: MapsSearchLog;
        Insert: Omit<MapsSearchLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<MapsSearchLog>;
        Relationships: [
          {
            foreignKeyName: "maps_search_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
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
