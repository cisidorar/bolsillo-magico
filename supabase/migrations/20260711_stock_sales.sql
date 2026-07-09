-- ── Ganancia/pérdida realizada al vender acciones ─────────────────────────────
-- Hasta ahora, vender una posición la borraba de stock_positions sin dejar
-- rastro: no quedaba costo base, ni cuánto se recibió, ni si fue ganancia o
-- pérdida. Esta tabla guarda cada venta como su propio registro histórico,
-- independiente de si la posición seguía viva o se cerró del todo (soporta
-- venta parcial: stock_positions.shares se reduce en vez de borrarse).
--
-- usd_purchase_id enlaza con la fila 'sell' que ya se crea en usd_purchases
-- SOLO cuando la posición vendida fue financiada por la billetera USD
-- (wallet_funded = true) — si no, los USD recibidos no vuelven a la billetera
-- porque tampoco salieron de ahí, pero la ganancia/pérdida se registra igual.

CREATE TABLE IF NOT EXISTS public.stock_sales (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           text          NOT NULL,
  shares_sold      numeric(12,4) NOT NULL CHECK (shares_sold > 0),
  cost_basis_usd   numeric(14,2) NOT NULL,   -- shares_sold × avg_cost_usd de la posición al momento de vender
  proceeds_usd     numeric(14,2) NOT NULL CHECK (proceeds_usd > 0),   -- USD recibidos por la venta
  realized_pnl_usd numeric(14,2) NOT NULL,   -- proceeds_usd − cost_basis_usd (puede ser negativo)
  sale_date        date          NOT NULL DEFAULT CURRENT_DATE,
  notes            text,
  usd_purchase_id  uuid          REFERENCES public.usd_purchases(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_stock_sales"
  ON public.stock_sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS stock_sales_user_date_idx ON public.stock_sales(user_id, sale_date DESC);
