-- ============================================================
-- Notificaciones por email
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- 1. Agregar columnas de preferencias de notificaciones a profiles
alter table public.profiles
  add column if not exists notify_billing boolean not null default true,
  add column if not exists notify_budget  boolean not null default true,
  add column if not exists notify_monthly boolean not null default false;

-- 2. Tabla de log para evitar enviar el mismo email dos veces el mismo día
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,  -- 'billing', 'budget_80', 'budget_100', 'monthly'
  ref_key     text not null,  -- ej. '2026-06-24:billing:pm-uuid' para idempotencia
  sent_at     timestamptz not null default now()
);

alter table public.notification_log enable row level security;
-- Solo lectura para el propio usuario; Edge Functions usan service_role y bypassean RLS
create policy "own_notification_log"
  on public.notification_log for select using (auth.uid() = user_id);

create unique index if not exists notification_log_ref_key_idx
  on public.notification_log (ref_key);

-- ============================================================
-- Recordatorios de gastos recurrentes (agregar después de la migración inicial)
-- ============================================================

-- 3. Agregar preferencia notify_recurring a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_recurring boolean NOT NULL DEFAULT true;

-- 4. Programar notify-recurring-reminder (requiere pg_cron y la URL base de la Edge Function)
-- Ejecutar UNA VEZ después de hacer deploy de la edge function:
--
-- SELECT cron.schedule(
--   'notify-recurring-due',
--   '0 12 * * *',   -- 9:00 AM Santiago (UTC-3); ajustar a 13 en horario de verano
--   $$
--   SELECT net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/notify-recurring-reminder?type=due',
--     headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
--   )
--   $$
-- );
--
-- SELECT cron.schedule(
--   'notify-recurring-overdue',
--   '0 13 * * *',   -- 10:00 AM Santiago (UTC-3)
--   $$
--   SELECT net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/notify-recurring-reminder?type=overdue',
--     headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
--   )
--   $$
-- );
