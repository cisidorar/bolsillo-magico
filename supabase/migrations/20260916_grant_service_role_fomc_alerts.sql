-- Fix: "[sync-prices] fomc_alerts upsert error: permission denied for table
-- fomc_alerts" — recurrente todos los días desde 2026-09-09 en los logs de
-- Vercel. Mismo patrón que 20260713_service_role_grants.sql y
-- 20260902_grant_service_role_snapshots.sql: fomc_alerts se creó con RLS
-- pero sin el GRANT explícito a service_role, así que el cron (que usa
-- service role, sin sesión de usuario — ver app/api/cron/sync-prices/route.ts)
-- nunca pudo escribir el recordatorio de FOMC. Consecuencia real: el correo
-- notify-fomc-reminder llevaba semana y media sin poder armarse.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fomc_alerts TO service_role;
