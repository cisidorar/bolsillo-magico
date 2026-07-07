-- ── Caja de dólares: compras de USD como activo (billetera Racional, etc.) ──
-- Cada fila es una compra: cuántos USD recibiste y cuántos CLP pagaste EN TOTAL
-- (comisión/spread incluidos) — el costo promedio por dólar absorbe la tarifa,
-- mismo patrón que stock_positions con total pagado.

CREATE TABLE IF NOT EXISTS public.usd_purchases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usd_amount     numeric(14,2) NOT NULL CHECK (usd_amount > 0),
  total_paid_clp integer     NOT NULL CHECK (total_paid_clp > 0),
  purchase_date  date        NOT NULL DEFAULT CURRENT_DATE,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usd_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own usd purchases"
  ON public.usd_purchases
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usd_purchases TO authenticated;

CREATE INDEX IF NOT EXISTS usd_purchases_user_idx ON public.usd_purchases(user_id);

-- Patrimonio: los dólares entran al snapshot mensual como categoría propia
ALTER TABLE public.net_worth_snapshots
  ADD COLUMN IF NOT EXISTS usd_clp integer NOT NULL DEFAULT 0;
