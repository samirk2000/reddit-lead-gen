-- Leads de Reddit (página web, landing o app de Roku) para el dashboard.
-- Pega este archivo en Supabase → SQL Editor y ejecútalo. Se puede volver a correr.
--
-- Cada fila pertenece a un usuario de la app (user_id = auth.uid()), igual que
-- maps_leads. El bot no entra con sesión: POST /api/reddit-web/ingest usa la
-- service role y asigna el dueño (REDDIT_INGEST_USER_ID, o el único usuario).
-- Volver a enviar el mismo reddit_id actualiza el contenido y NO pisa estado
-- ni notas: el ingest omite esas columnas.
--
-- Si ya existe el borrador del bot (id bigint, sin user_id) y está vacío, se
-- reemplaza por este esquema. Si tiene filas, no se borran: se agrega user_id.
-- Esas filas no se ven en el dashboard hasta asignarles dueño:
--   update public.reddit_web_leads
--      set user_id = 'UUID-DEL-USUARIO'
--    where user_id is null;

-- PL/pgSQL plans every static query before the IF runs, so
-- `select from public.reddit_web_leads` errors with 42P01 when the table
-- is missing. The row check and the drop go through EXECUTE, which is
-- planned only after to_regclass confirms the legacy table is there.
do $$
declare
  legacy_has_rows boolean;
begin
  if to_regclass('public.reddit_web_leads') is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reddit_web_leads'
      and column_name = 'id'
      and udt_name = 'int8'
  ) then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reddit_web_leads'
      and column_name = 'user_id'
  ) then
    return;
  end if;

  execute 'select exists (select 1 from public.reddit_web_leads)'
    into legacy_has_rows;

  if legacy_has_rows then
    return;
  end if;

  execute 'drop table public.reddit_web_leads';
end $$;

create table if not exists public.reddit_web_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reddit_id text not null,
  url text not null,
  title text not null,
  subreddit text not null,
  author text,
  created_utc timestamptz,
  problema text,
  pais_detectado text,
  idioma text check (idioma in ('es-MX', 'en-US')),
  score_intencion double precision check (score_intencion between 0 and 1),
  intencion text,
  clasificador text,
  keywords text[] not null default '{}',
  borrador_es text,
  borrador_en text,
  estado text not null default 'nuevo' check (
    estado in (
      'nuevo',
      'respondido',
      'contactado',
      'cotizado',
      'ganado',
      'descartado'
    )
  ),
  notas text not null default '',
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reddit_web_leads
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.reddit_web_leads
  add column if not exists keywords text[] default '{}';

alter table public.reddit_web_leads
  add column if not exists notas text default '';

alter table public.reddit_web_leads
  add column if not exists estado text default 'nuevo';

update public.reddit_web_leads
  set keywords = '{}'::text[]
  where keywords is null;

update public.reddit_web_leads
  set notas = ''
  where notas is null;

update public.reddit_web_leads
  set estado = 'nuevo'
  where estado is null;

alter table public.reddit_web_leads
  alter column keywords set default '{}';

alter table public.reddit_web_leads
  alter column keywords set not null;

alter table public.reddit_web_leads
  alter column notas set default '';

alter table public.reddit_web_leads
  alter column notas set not null;

alter table public.reddit_web_leads
  alter column estado set default 'nuevo';

alter table public.reddit_web_leads
  alter column estado set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reddit_web_leads'
      and column_name = 'user_id'
      and is_nullable = 'YES'
  )
  and not exists (
    select 1 from public.reddit_web_leads where user_id is null
  )
  then
    alter table public.reddit_web_leads
      alter column user_id set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reddit_web_leads'
      and column_name = 'score_intencion'
      and udt_name <> 'float8'
  )
  then
    alter table public.reddit_web_leads
      drop constraint if exists reddit_web_leads_score_intencion_check;
    alter table public.reddit_web_leads
      alter column score_intencion type double precision
      using score_intencion::double precision;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reddit_web_leads'::regclass
      and conname = 'reddit_web_leads_estado_check'
  )
  then
    alter table public.reddit_web_leads
      add constraint reddit_web_leads_estado_check
      check (
        estado in (
          'nuevo',
          'respondido',
          'contactado',
          'cotizado',
          'ganado',
          'descartado'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reddit_web_leads'::regclass
      and conname = 'reddit_web_leads_idioma_check'
  )
  then
    alter table public.reddit_web_leads
      add constraint reddit_web_leads_idioma_check
      check (idioma in ('es-MX', 'en-US'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reddit_web_leads'::regclass
      and conname = 'reddit_web_leads_score_intencion_check'
  )
  then
    alter table public.reddit_web_leads
      add constraint reddit_web_leads_score_intencion_check
      check (score_intencion between 0 and 1);
  end if;
end $$;

create unique index if not exists reddit_web_leads_user_reddit_uidx
  on public.reddit_web_leads (user_id, reddit_id);

create index if not exists reddit_web_leads_user_inserted_idx
  on public.reddit_web_leads (user_id, inserted_at desc);

create index if not exists reddit_web_leads_user_created_idx
  on public.reddit_web_leads (user_id, created_utc desc);

create index if not exists reddit_web_leads_user_estado_idx
  on public.reddit_web_leads (user_id, estado);

create index if not exists reddit_web_leads_user_idioma_idx
  on public.reddit_web_leads (user_id, idioma);

comment on table public.reddit_web_leads is
  'Posts de Reddit donde piden web, landing o app Roku. El dueño es auth.uid(). El bot inserta con service role; la app solo cambia estado y notas.';

create or replace function public.reddit_web_leads_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists reddit_web_leads_touch on public.reddit_web_leads;

create trigger reddit_web_leads_touch
  before update on public.reddit_web_leads
  for each row
  execute function public.reddit_web_leads_touch();

alter table public.reddit_web_leads enable row level security;

drop policy if exists "reddit_web_leads_select_own" on public.reddit_web_leads;
create policy "reddit_web_leads_select_own"
  on public.reddit_web_leads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "reddit_web_leads_update_own" on public.reddit_web_leads;
create policy "reddit_web_leads_update_own"
  on public.reddit_web_leads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.reddit_web_leads from anon;
revoke all on table public.reddit_web_leads from authenticated;

grant select on table public.reddit_web_leads to authenticated;
grant update (estado, notas, updated_at) on table public.reddit_web_leads to authenticated;

grant select, insert, update, delete on table public.reddit_web_leads to service_role;
