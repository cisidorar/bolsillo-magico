-- ── price_cache: caché compartida de precios de mercado ───────────────────────
-- Almacena cotizaciones de acciones y tipo de cambio USD/CLP.
-- No tiene user_id porque los precios de mercado son datos públicos.
-- TTL se maneja en la aplicación (5 min stocks, 30 min FX).

CREATE TABLE IF NOT EXISTS public.price_cache (
  ticker      text        PRIMARY KEY,
  price       numeric     NOT NULL,
  change_pct  numeric     NOT NULL DEFAULT 0,
  name        text,
  history7d   jsonb,                           -- number[] precios cierre últimos 7 días
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

-- Datos de mercado son públicos: cualquier usuario autenticado puede leer y escribir el caché
CREATE POLICY "Authenticated users manage price cache"
  ON public.price_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_cache TO authenticated;
