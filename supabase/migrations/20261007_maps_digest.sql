-- Lista diaria de Negocios sin web.
-- Hay que correr este archivo en Supabase → SQL Editor después de
-- supabase/migrations/20260925_maps_leads.sql. Se puede volver a ejecutar.
--
-- Agrega el estado enviado_a_lista y la bitácora maps_digest_log, para no
-- repetir un negocio que ya salió en la lista o que ya se contactó.
-- El endpoint GET /api/maps/daily-list escribe con la service role.
-- El dashboard lee maps_leads con la sesión del usuario.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'maps_leads'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
    and pg_get_constraintdef(con.oid) not ilike '%lead_reason%';

  if constraint_name is not null then
    execute format('alter table public.maps_leads drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.maps_leads
  drop constraint if exists maps_leads_status_check;

alter table public.maps_leads
  add constraint maps_leads_status_check
  check (
    status in (
      'nuevo',
      'enviado_a_lista',
      'contactado',
      'respondió',
      'cerrado',
      'descartado'
    )
  );

create table if not exists public.maps_digest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  digest_date date not null,
  source text not null default 'default' check (source in ('default', 'custom')),
  created_at timestamptz not null default now()
);

create unique index if not exists maps_digest_log_user_place_uidx
  on public.maps_digest_log (user_id, place_id);

create index if not exists maps_digest_log_user_date_idx
  on public.maps_digest_log (user_id, digest_date desc);

comment on table public.maps_digest_log is
  'Google places already returned by GET /api/maps/daily-list. One row per owner and place.';

comment on column public.maps_leads.status is
  'nuevo, enviado_a_lista (daily digest), contactado, respondió, cerrado, descartado.';

alter table public.maps_digest_log enable row level security;

drop policy if exists "maps_digest_log_select_own" on public.maps_digest_log;
create policy "maps_digest_log_select_own"
  on public.maps_digest_log
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.maps_digest_log from anon;
grant select on table public.maps_digest_log to authenticated;
