-- ============================================================
-- Configurar pg_cron para las Edge Functions de notificaciones
-- Ejecutar en: Supabase > SQL Editor  (una sola vez)
-- Requiere tener pg_cron habilitado en tu proyecto Supabase
-- ============================================================

-- Reemplaza los valores entre < > con los tuyos:
--   <PROJECT_REF>   → tu Supabase project ref (ej. abcdefghijklmnop)
--   <SERVICE_ROLE>  → tu service_role key (Settings > API)

-- 1. Recordatorio de cierre de tarjeta — todos los días a las 9:00 AM UTC (6:00 AM Chile)
select cron.schedule(
  'notify-billing-daily',
  '0 12 * * *',   -- 12:00 UTC = 09:00 CLT (UTC-3)
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-billing',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) as result;
  $$
);

-- 2. Alerta de presupuesto — todos los días a las 9:05 AM UTC
select cron.schedule(
  'notify-budget-daily',
  '5 12 * * *',   -- 12:05 UTC = 09:05 CLT
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-budget',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) as result;
  $$
);

-- ── Verificar que quedaron creados ────────────────────────────────────────────
-- select jobname, schedule, command, active from cron.job;

-- ── Para eliminar un job si necesitas modificarlo ─────────────────────────────
-- select cron.unschedule('notify-billing-daily');
-- select cron.unschedule('notify-budget-daily');
