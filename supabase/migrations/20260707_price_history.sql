-- ── Pipeline OHLCV: precios diarios persistidos en la BD ─────────────────────
-- Los indicadores técnicos se calculan desde acá — cero dependencia de
-- proveedores externos en runtime. Se llena con el sync diario (Tiingo como
-- fuente primaria) y lazy-sync al abrir un ticker sin historia.
-- Sin user_id: los precios de mercado son datos públicos (mismo criterio que price_cache).

CREATE TABLE IF NOT EXISTS public.price_history (
  ticker  text    NOT NULL,
  date    date    NOT NULL,
  open    numeric,
  high    numeric,
  low     numeric,
  close   numeric NOT NULL,   -- adjClose cuando la fuente lo entrega (splits/dividendos)
  volume  bigint,
  PRIMARY KEY (ticker, date)
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage price history"
  ON public.price_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_history TO authenticated;
-- El cron (service role) bypassa RLS.

CREATE INDEX IF NOT EXISTS price_history_ticker_date_idx
  ON public.price_history(ticker, date DESC);
