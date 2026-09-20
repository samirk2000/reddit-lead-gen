-- Sales CTA fields for suggested replies (WhatsApp + website).
-- Run in Supabase SQL Editor if not applied via CLI.

alter table public.user_settings
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_url text,
  add column if not exists website_url text,
  add column if not exists business_name text;

comment on column public.user_settings.whatsapp_number is
  'E.164 digits; fallback for wa.me when whatsapp_url is empty.';
comment on column public.user_settings.whatsapp_url is
  'WhatsApp Business click-to-chat URL (preferred).';
comment on column public.user_settings.website_url is
  'Public landing / sales page URL included in suggested replies.';
comment on column public.user_settings.business_name is
  'Optional brand name for soft self-intro in replies.';
