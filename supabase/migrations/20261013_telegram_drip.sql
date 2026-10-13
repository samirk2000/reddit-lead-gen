-- Telegram drip ("goteo") state, moved from the box notifier to Vercel.
create table if not exists public.telegram_drip_state (
  id smallint primary key default 1 check (id = 1),
  paused boolean not null default false,
  pending jsonb,
  last_action_at bigint not null default 0,
  next_at bigint not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.telegram_drip_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.telegram_drip_days (
  date date primary key,
  sent jsonb not null default '[]'::jsonb,
  user_skipped jsonb not null default '[]'::jsonb,
  skipped jsonb not null default '[]'::jsonb,
  recap_sent boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Do-not-contact by last 10 phone digits (contacted, no WhatsApp, switchboard, opt-out).
create table if not exists public.telegram_drip_dnc (
  phone10 text primary key check (phone10 ~ '^\d{10}$'),
  reason text not null,
  created_at timestamptz not null default now()
);

-- Service role only (used by the API routes). No policies => no anon/auth access.
alter table public.telegram_drip_state enable row level security;
alter table public.telegram_drip_days enable row level security;
alter table public.telegram_drip_dnc enable row level security;
