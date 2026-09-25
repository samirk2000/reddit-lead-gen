-- Negocios sin sitio web (Google Places / WhatsApp manual).
-- Run in the Supabase SQL Editor if it is not applied via CLI.
--
-- place_id is unique per owner (user_id, place_id): the app is multi-user,
-- so two accounts can track the same Google place. Re-running a search
-- refreshes business fields and last_seen_at only. status and notes are
-- omitted from that upsert in lib/maps/persist.ts.

create table if not exists public.maps_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  name text not null,
  address text,
  phone_national text,
  phone_international text,
  whatsapp_e164 text,
  rating double precision,
  user_rating_count integer,
  website_uri text,
  google_maps_uri text,
  business_status text,
  specialty text not null,
  city text not null,
  lead_reason text not null check (lead_reason in ('sin_sitio', 'solo_red_social')),
  priority_score integer not null default 0,
  status text not null default 'nuevo' check (
    status in ('nuevo', 'contactado', 'respondió', 'cerrado', 'descartado')
  ),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists maps_leads_user_place_uidx
  on public.maps_leads (user_id, place_id);

create index if not exists maps_leads_user_score_idx
  on public.maps_leads (user_id, priority_score desc);

create index if not exists maps_leads_user_status_idx
  on public.maps_leads (user_id, status);

create index if not exists maps_leads_user_specialty_idx
  on public.maps_leads (user_id, specialty);

create index if not exists maps_leads_user_city_idx
  on public.maps_leads (user_id, city);

comment on table public.maps_leads is
  'Google Maps prospects without a real website, owned by auth.uid().';

create table if not exists public.maps_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  whatsapp_template text not null,
  updated_at timestamptz not null default now()
);

comment on table public.maps_settings is
  'Per-user WhatsApp template for maps prospects. Not sent automatically.';

create table if not exists public.maps_search_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists maps_search_log_user_created_idx
  on public.maps_search_log (user_id, created_at desc);

comment on table public.maps_search_log is
  'Successful Places searches, used to cap cost at 30 per user per hour.';

alter table public.maps_leads enable row level security;
alter table public.maps_settings enable row level security;
alter table public.maps_search_log enable row level security;

drop policy if exists "maps_leads_select_own" on public.maps_leads;
create policy "maps_leads_select_own"
  on public.maps_leads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "maps_leads_insert_own" on public.maps_leads;
create policy "maps_leads_insert_own"
  on public.maps_leads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "maps_leads_update_own" on public.maps_leads;
create policy "maps_leads_update_own"
  on public.maps_leads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "maps_leads_delete_own" on public.maps_leads;
create policy "maps_leads_delete_own"
  on public.maps_leads
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "maps_settings_select_own" on public.maps_settings;
create policy "maps_settings_select_own"
  on public.maps_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "maps_settings_insert_own" on public.maps_settings;
create policy "maps_settings_insert_own"
  on public.maps_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "maps_settings_update_own" on public.maps_settings;
create policy "maps_settings_update_own"
  on public.maps_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "maps_search_log_select_own" on public.maps_search_log;
create policy "maps_search_log_select_own"
  on public.maps_search_log
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "maps_search_log_insert_own" on public.maps_search_log;
create policy "maps_search_log_insert_own"
  on public.maps_search_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on table public.maps_leads from anon;
revoke all on table public.maps_settings from anon;
revoke all on table public.maps_search_log from anon;

grant select, insert, update, delete on table public.maps_leads to authenticated;
grant select, insert, update on table public.maps_settings to authenticated;
grant select, insert on table public.maps_search_log to authenticated;
