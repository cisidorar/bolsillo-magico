-- ── Enriquecer daily_signals para el rediseño del digest (mockup jul 2026) ───
-- El nuevo correo muestra TODA la watchlist (no solo lo accionable): agrega
-- 'hold' como kind válido para los tickers en neutral, más el % de cambio del
-- día (para el precio con flecha) y un flag `strong` para separar "Señales
-- fuertes" (compra_fuerte/venta_fuerte) del resto de la lista.

ALTER TABLE public.daily_signals DROP CONSTRAINT IF EXISTS daily_signals_kind_check;
ALTER TABLE public.daily_signals ADD CONSTRAINT daily_signals_kind_check
  CHECK (kind IN ('buy', 'sell', 'caution', 'target', 'hold'));

ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS change_pct numeric;
ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS strong boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_signals ADD COLUMN IF NOT EXISTS watch boolean NOT NULL DEFAULT false;

-- price_cache (20260628) tiene el mismo bug de GRANT que watchlist/stock_positions/
-- price_history: nunca se le dio acceso a service_role. El digest lo necesita
-- para el nombre y dominio (logo) de cada ticker.
GRANT ALL ON public.price_cache TO service_role;
