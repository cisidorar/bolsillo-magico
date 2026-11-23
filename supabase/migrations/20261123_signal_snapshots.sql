-- Registro diario del motor + resultado real (nov 2026, docs/PLAN_MOTOR_PREDICCION.md)
--
-- Hasta ahora el motor decía "compra X" cada día y nadie miraba después qué
-- pasó. Esta tabla guarda, UNA fila por ticker por día de mercado, lo que el
-- motor leyó (rating, convicción, flags de cada componente) y, semanas
-- después, cuánto rindió el ticker y SPY a 5/20/60 ruedas. Es la prueba
-- fuera de muestra definitiva: no se puede sobreajustar algo que todavía no
-- había pasado cuando se registró.
--
-- La llena /api/cron/sync-prices (reutiliza los analyze() ya calculados) y
-- llama a fill_signal_outcomes() para completar los retornos que ya se
-- pueden medir. Dato del TICKER, no del usuario (como signal_stats).

CREATE TABLE IF NOT EXISTS public.signal_snapshots (
  ticker           text        NOT NULL,
  snapshot_date    date        NOT NULL,   -- fecha de la vela analizada (analysis.asOf)
  price            numeric     NOT NULL,
  rating_label     text        NOT NULL,
  rating_score     int         NOT NULL,
  trend_score      int         NOT NULL,
  trigger_score    int         NOT NULL,
  conviction_score int,
  conviction_tier  text,
  price_zone       text,
  actionable_buy   boolean     NOT NULL DEFAULT false,   -- isActionableBuyNow con el régimen del día
  market_regime    text,
  flags            jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- extractFlags() de lib/signal-research.ts
  mom12_1          numeric,                               -- informativo, no entra al score
  ret_5            numeric,   -- % del ticker a 5/20/60 ruedas (null hasta que pasen)
  ret_20           numeric,
  ret_60           numeric,
  spy_ret_5        numeric,
  spy_ret_20       numeric,
  spy_ret_60       numeric,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, snapshot_date)
);

ALTER TABLE public.signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_signal_snapshots"
  ON public.signal_snapshots FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.signal_snapshots TO authenticated;
GRANT ALL ON public.signal_snapshots TO service_role;

CREATE INDEX IF NOT EXISTS signal_snapshots_pending_idx
  ON public.signal_snapshots(snapshot_date) WHERE ret_60 IS NULL;

-- Completa los retornos futuros que ya se pueden medir. Idempotente: solo
-- toca filas con ret_60 pendiente y de los últimos ~5 meses (60 ruedas ≈ 3
-- meses + margen). Devuelve cuántas filas actualizó.
CREATE OR REPLACE FUNCTION public.fill_signal_outcomes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH ph AS (
    SELECT ticker, date, close::numeric AS c,
           row_number() OVER (PARTITION BY ticker ORDER BY date) AS rn
    FROM price_history
    WHERE date >= current_date - 220
  ),
  base AS (
    SELECT s.ticker, s.snapshot_date, p.rn, p.c, sp.rn AS srn, sp.c AS sc
    FROM signal_snapshots s
    JOIN ph p  ON p.ticker = s.ticker AND p.date = s.snapshot_date
    JOIN ph sp ON sp.ticker = 'SPY'   AND sp.date = s.snapshot_date
    WHERE s.ret_60 IS NULL AND s.snapshot_date >= current_date - 150
  ),
  calc AS (
    SELECT b.ticker, b.snapshot_date,
      round((f5.c  / b.c - 1) * 100, 2)  AS r5,
      round((f20.c / b.c - 1) * 100, 2)  AS r20,
      round((f60.c / b.c - 1) * 100, 2)  AS r60,
      round((s5.c  / b.sc - 1) * 100, 2) AS sr5,
      round((s20.c / b.sc - 1) * 100, 2) AS sr20,
      round((s60.c / b.sc - 1) * 100, 2) AS sr60
    FROM base b
    LEFT JOIN ph f5  ON f5.ticker  = b.ticker AND f5.rn  = b.rn + 5
    LEFT JOIN ph f20 ON f20.ticker = b.ticker AND f20.rn = b.rn + 20
    LEFT JOIN ph f60 ON f60.ticker = b.ticker AND f60.rn = b.rn + 60
    LEFT JOIN ph s5  ON s5.ticker  = 'SPY'    AND s5.rn  = b.srn + 5
    LEFT JOIN ph s20 ON s20.ticker = 'SPY'    AND s20.rn = b.srn + 20
    LEFT JOIN ph s60 ON s60.ticker = 'SPY'    AND s60.rn = b.srn + 60
  )
  UPDATE signal_snapshots s SET
    ret_5 = c.r5, ret_20 = c.r20, ret_60 = c.r60,
    spy_ret_5 = c.sr5, spy_ret_20 = c.sr20, spy_ret_60 = c.sr60
  FROM calc c
  WHERE s.ticker = c.ticker AND s.snapshot_date = c.snapshot_date
    AND (s.ret_5 IS DISTINCT FROM c.r5 OR s.ret_20 IS DISTINCT FROM c.r20 OR s.ret_60 IS DISTINCT FROM c.r60);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_signal_outcomes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_signal_outcomes() TO service_role;

-- Track record por ticker medido contra SPY (lib/signal-backtest.ts): el
-- retorno excedente promedio a 20 ruedas. hit_rate_20 pasa a significar
-- "le ganó a SPY" cuando esta columna no es null.
ALTER TABLE public.signal_stats ADD COLUMN IF NOT EXISTS avg_excess_20 numeric(6,1);
