-- Track record persistido por ticker (D1 del roadmap de calidad de decisión) — jul 2026
--
-- computeConviction() (lib/conviction.ts) fue diseñado con 4 componentes, uno
-- de ellos el track record (20% del peso: ¿qué tan seguido acertó ESTA señal
-- en ESTE ticker?, via lib/signal-backtest.ts). Pero backtestSignals() es caro
-- (recorre ~1 año de ruedas re-corriendo analyze() día a día) y hasta ahora
-- SOLO se calculaba on-demand cuando el usuario tocaba "¿Le funcionó esta
-- señal antes?" en el detalle — todos los demás call sites (Radar, cabecera
-- del detalle, daily_decisions) pasaban backtestStats=null. El 20% del score
-- nunca existió en producción.
--
-- Esta tabla guarda, UNA fila por ticker+label, el resultado de
-- backtestSignals() calculado por el cron nocturno (sync-prices) — una vez
-- por ticker por día, no por usuario (el backtest es del ticker, no del
-- usuario que lo sigue). Los call sites leen esta tabla (fetch liviano) en
-- vez de recibir null.

CREATE TABLE IF NOT EXISTS public.signal_stats (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        text        NOT NULL,
  label         text        NOT NULL,   -- compra_fuerte/compra/neutral/venta/venta_fuerte
  count         int         NOT NULL,
  hit_rate_20   numeric(5,1),           -- % de veces que la señal "acertó" a 20 ruedas
  avg_return_20 numeric(6,1),
  avg_return_60 numeric(6,1),
  computed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signal_stats ENABLE ROW LEVEL SECURITY;

-- Dato del TICKER, no del usuario — cualquier usuario autenticado puede leer
-- el track record de cualquier ticker (igual que price_history/price_cache).
CREATE POLICY "read_signal_stats"
  ON public.signal_stats FOR SELECT
  TO authenticated
  USING (true);

-- Una fila por ticker+label — el cron hace upsert cada noche.
CREATE UNIQUE INDEX IF NOT EXISTS signal_stats_dedupe_idx
  ON public.signal_stats(ticker, label);

GRANT ALL ON public.signal_stats TO service_role;
GRANT SELECT ON public.signal_stats TO authenticated;
