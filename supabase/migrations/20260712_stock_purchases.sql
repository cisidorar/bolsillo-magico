-- ── Historial de compras ───────────────────────────────────────────────────
-- stock_positions guarda solo el agregado (acciones totales + costo promedio),
-- nunca guardó cada compra por separado. Esta tabla registra cada compra
-- individual (fecha y precio propios) desde ahora en adelante, igual que
-- stock_sales ya hace con las ventas — juntas arman el timeline de
-- "Movimientos" de una posición. Las compras anteriores a este cambio no se
-- pueden reconstruir retroactivamente (solo existe el agregado).

CREATE TABLE IF NOT EXISTS public.stock_purchases (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker          text          NOT NULL,
  shares          numeric(12,4) NOT NULL CHECK (shares > 0),
  total_paid_usd  numeric(14,2) NOT NULL CHECK (total_paid_usd > 0),
  purchase_date   date          NOT NULL DEFAULT CURRENT_DATE,
  notes           text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_stock_purchases"
  ON public.stock_purchases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS stock_purchases_user_ticker_idx ON public.stock_purchases(user_id, ticker, purchase_date);
