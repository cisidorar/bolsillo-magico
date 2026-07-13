-- ── Fix: "No se pudo registrar la ganancia/pérdida de la venta" ──────────────
-- stock_sales (20260711) y stock_purchases (20260712) crearon la tabla + RLS
-- pero nunca les dieron el GRANT base a `authenticated` — mismo bug que ya
-- apareció en daily_signals, watchlist, stock_positions, price_history y
-- price_cache. RLS con USING/WITH CHECK solo filtra filas que el rol YA puede
-- consultar; sin el GRANT, Postgres corta el INSERT antes de evaluar RLS.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_sales     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_purchases TO authenticated;
