-- Splits de acciones (nov 2026) — caso real: Sandisk (SNDK) 8×1 el 20-nov-2026.
--
-- price_history se sincroniza de forma incremental, así que un split dejaba el
-- historial viejo sin ajustar (cierre de 755 pegado a uno de 79) y las
-- posiciones de los usuarios con las acciones y el costo de antes del split:
-- la app mostraba −95% y una alarma de salida imposible. El historial ahora se
-- recarga solo (lib/price-providers.ts, lib/splits.ts); esta función ajusta lo
-- que cada usuario tiene registrado, una sola vez por split.
--
-- Qué ajusta (factor = acciones nuevas por cada vieja; 8 = 8×1, 0.1 = reverse 1×10):
--   · stock_positions: acciones × factor, costo promedio ÷ factor (el costo
--     TOTAL no cambia). Compras hechas el día del split o después ya vienen en
--     acciones nuevas y no se multiplican. La alarma guardada (trail_stop_usd)
--     se ÷ factor, o se reinicia si la posición mezcla antes y después.
--   · stock_purchases / stock_sales previas al split: acciones × factor.
--   · watchlist.target_price creado antes del split: ÷ factor.
--
-- Idempotente: stock_splits (ticker, fecha) impide aplicarlo dos veces.

CREATE TABLE IF NOT EXISTS public.stock_splits (
  ticker              text        NOT NULL,
  split_date          date        NOT NULL,   -- primer día ya post-split
  factor              numeric     NOT NULL,
  positions_adjusted  int         NOT NULL DEFAULT 0,
  applied_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, split_date)
);

ALTER TABLE public.stock_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_stock_splits" ON public.stock_splits FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.stock_splits TO authenticated;
GRANT ALL ON public.stock_splits TO service_role;

CREATE OR REPLACE FUNCTION public.apply_stock_split(p_ticker text, p_date date, p_factor numeric)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_ins int;
  n_pos int := 0;
BEGIN
  IF p_factor IS NULL OR p_factor <= 0 OR abs(p_factor - 1) < 0.001 THEN
    RETURN 0;
  END IF;

  INSERT INTO stock_splits (ticker, split_date, factor)
  VALUES (p_ticker, p_date, p_factor)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_ins = ROW_COUNT;
  IF n_ins = 0 THEN RETURN 0; END IF;   -- ya aplicado

  UPDATE stock_positions sp SET
    shares         = q.new_shares,
    avg_cost_usd   = (sp.shares * sp.avg_cost_usd) / q.new_shares,
    trail_stop_usd = CASE WHEN q.post > 0 THEN NULL ELSE sp.trail_stop_usd / p_factor END,
    updated_at     = now()
  FROM (
    SELECT s2.id, COALESCE(pp.post, 0) AS post,
           GREATEST(s2.shares - COALESCE(pp.post, 0), 0) * p_factor + LEAST(COALESCE(pp.post, 0), s2.shares) AS new_shares
    FROM stock_positions s2
    LEFT JOIN (
      SELECT user_id, sum(shares) AS post
      FROM stock_purchases
      WHERE ticker = p_ticker AND purchase_date >= p_date
      GROUP BY user_id
    ) pp ON pp.user_id = s2.user_id
    WHERE s2.ticker = p_ticker
  ) q
  WHERE sp.id = q.id AND q.new_shares > 0;
  GET DIAGNOSTICS n_pos = ROW_COUNT;

  UPDATE stock_purchases SET shares = shares * p_factor
  WHERE ticker = p_ticker AND purchase_date < p_date;

  UPDATE stock_sales SET shares_sold = shares_sold * p_factor
  WHERE ticker = p_ticker AND sale_date < p_date;

  UPDATE watchlist SET target_price = target_price / p_factor
  WHERE ticker = p_ticker AND target_price IS NOT NULL AND created_at < p_date::timestamptz;

  UPDATE stock_splits SET positions_adjusted = n_pos
  WHERE ticker = p_ticker AND split_date = p_date;

  RETURN n_pos;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_split(text, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_split(text, date, numeric) TO service_role;
