-- Cursor for the daily-list refill. The drip keeps asking for the next
-- giro/city window until today's confirmed sends reach the quota.
alter table public.telegram_drip_state
  add column if not exists query_cursor bigint not null default 0,
  add column if not exists cursor_empty smallint not null default 0,
  add column if not exists cursor_day date;
