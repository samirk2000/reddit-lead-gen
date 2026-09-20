-- Dual replies + follow-up snooze for sales queue.
-- Run in Supabase SQL Editor.

alter table public.detected_leads
  add column if not exists suggested_reply_wa text,
  add column if not exists follow_up_at timestamptz;

comment on column public.detected_leads.suggested_reply is
  'Public Quora/Reddit-safe reply (value-first, soft DM, no WhatsApp links).';
comment on column public.detected_leads.suggested_reply_wa is
  'Private operator follow-up with WhatsApp/web CTA for DM or WA.';
comment on column public.detected_leads.follow_up_at is
  'When set in the future, lead is snoozed out of Todos until that time.';
