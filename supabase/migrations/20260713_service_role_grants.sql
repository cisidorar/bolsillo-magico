-- ── Fix: sync-prices devuelve total:0 aunque la service_role key es correcta ──
-- Mismo problema que tuvo daily_signals (20260710b): estas tablas se crearon
-- por migración SQL y nunca recibieron el GRANT base para service_role.
-- RLS solo filtra FILAS que un rol YA puede consultar — sin el GRANT de tabla,
-- Postgres corta con "permission denied" ANTES de evaluar RLS.
--
-- El bug quedó enmascarado porque app/api/cron/sync-prices/route.ts desestructura
-- solo `data` de las queries a watchlist/stock_positions y nunca revisa `error`,
-- así que un "permission denied" se traduce silenciosamente en lista vacía.

GRANT ALL ON public.watchlist        TO service_role;
GRANT ALL ON public.stock_positions  TO service_role;
GRANT ALL ON public.stock_sales      TO service_role;
GRANT ALL ON public.stock_purchases  TO service_role;
GRANT ALL ON public.usd_purchases    TO service_role;
