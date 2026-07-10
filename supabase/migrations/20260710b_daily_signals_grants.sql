-- ── Fix: "permission denied for table daily_signals" ──────────────────────────
-- La migración original (20260710_daily_signals.sql) creó la tabla y las
-- políticas RLS, pero nunca le dio el GRANT base a los roles de Supabase.
-- RLS solo filtra FILAS que un rol YA puede consultar — sin el GRANT de
-- tabla, ni service_role ni authenticated pueden ni siquiera intentar la
-- consulta, y Postgres corta con "permission denied" antes de evaluar RLS.

GRANT ALL ON public.daily_signals TO service_role;
GRANT SELECT ON public.daily_signals TO authenticated;
