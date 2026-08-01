-- ── Convicción/precio por señal (jul 2026, a pedido de Cas) ──────────────────
-- Bug reportado con capturas: el digest mostraba "SEÑAL DE COMPRA" para AMZN,
-- GOOGL e INTC con el mismo peso visual, mientras la app (panel "¿Qué comprar
-- hoy?") decía que la mejor compra del día era NVDA y que AMZN tenía
-- convicción 39/100 ("Caro"). Son dos sistemas reales y distintos por diseño
-- (daily_signals.kind viene de analysis.rating, un gatillo técnico puro;
-- daily_decisions/ConvictionChip vienen de computeConviction(), que además
-- pesa riesgo/recompensa, track record y fuerza vs. SPY) — pero mostrar solo
-- el primero en el correo, sin el segundo, hace que el usuario no sepa a cuál
-- de los dos creerle. Esta columna deja que el correo muestre el MISMO número
-- de convicción y la MISMA zona de precio que ya ve en la app, en vez de una
-- señal "compra" desnuda sin ese contexto.

ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS conviction_score numeric;
ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS conviction_tier  text
  CHECK (conviction_tier IN ('compra_fuerte', 'compra', 'neutral', 'evitar', 'venta'));
ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS price_zone text
  CHECK (price_zone IN ('conveniente', 'justo', 'caro'));
