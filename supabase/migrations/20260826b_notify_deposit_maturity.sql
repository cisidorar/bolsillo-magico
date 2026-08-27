-- ============================================================
-- Aviso de vencimiento de depósito a plazo (ago 2026)
-- Edge Function notify-deposit-maturity corre diariamente y envía
-- un correo cuando maturity_date = hoy (hora Chile).
-- ============================================================

alter table public.profiles
  add column if not exists notify_deposit_maturity boolean not null default true;
