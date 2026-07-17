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

-- 3. Resumen mensual — el día 1 de cada mes a las 13:30 CLT
--    Resume el mes anterior completo (ej. 1 de julio → resumen de junio)
select cron.schedule(
  'notify-monthly-summary',
  '30 16 1 * *',   -- 16:30 UTC = 13:30 CLT, solo el día 1 de cada mes
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-monthly-summary',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) as result;
  $$
);

-- 4. Recordatorio de pagos recurrentes — todos los días a las 9:15 AM CLT
select cron.schedule(
  'notify-recurring-reminder',
  '15 12 * * *',   -- 12:15 UTC = 09:15 CLT
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-recurring-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) as result;
  $$
);

-- 5. Digest diario de Favoritos (Inversiones → Acciones) — DESACTIVADO como
--    pg_cron aparte (jul 2026). Antes corría acá 1h después del cron de
--    sync-prices de Vercel (22:30 UTC) con margen "a ojo" para que alcanzara a
--    terminar — frágil (el margen se corría solo con el horario de verano
--    chileno) y agregaba hasta 1h de espera entre que la señal se calcula y el
--    correo sale de verdad. Ahora /api/cron/sync-prices (Vercel) invoca la
--    Edge Function DIRECTAMENTE al terminar de calcular daily_signals/
--    daily_decisions — sin desfase, un solo evento.
--
--    Si tu proyecto todavía tiene el job viejo programado (de una instalación
--    anterior a jul 2026), sácalo para no duplicar correos — aunque la Edge
--    Function es idempotente por usuario/día (notification_log) y un duplicado
--    no manda dos correos, es una invocación de más sin sentido:
--
--    select cron.unschedule('notify-watchlist-digest-daily');
--
--    (Bloque dejado comentado abajo solo como referencia de cómo se programaba
--    antes — no ejecutar salvo que quieras volver al modelo de cron aparte.)
--
-- select cron.schedule(
--   'notify-watchlist-digest-daily',
--   '30 23 * * *',   -- 23:30 UTC = 19:30 CLT (horario normal)
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-watchlist-digest',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE>',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   ) as result;
--   $$
-- );

-- ── Verificar que quedaron creados ────────────────────────────────────────────
-- select jobname, schedule, command, active from cron.job;

-- ── Para eliminar un job si necesitas modificarlo ─────────────────────────────
-- select cron.unschedule('notify-billing-daily');
-- select cron.unschedule('notify-budget-daily');
-- select cron.unschedule('notify-monthly-summary');
-- select cron.unschedule('notify-recurring-reminder');
-- select cron.unschedule('notify-watchlist-digest-daily');
