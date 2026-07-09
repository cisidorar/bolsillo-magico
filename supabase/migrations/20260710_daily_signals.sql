-- ── Digest diario de compra/venta ─────────────────────────────────────────────
-- Reemplaza el correo instantáneo por precio objetivo (notify-watchlist-target,
-- todavía sin desplegar) por UN correo diario consolidado: todo lo accionable
-- del día (compra / venta / toma de ganancias / precio objetivo alcanzado) en
-- un solo mensaje, no uno por evento.
--
-- Lo llena /api/cron/sync-prices (Vercel, Node — ahí vive analyze()) después de
-- sincronizar precios. Lo lee la Edge Function notify-watchlist-digest (Supabase)
-- y arma el correo — así el cálculo técnico no se duplica en Deno.

CREATE TABLE IF NOT EXISTS public.daily_signals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('buy', 'sell', 'caution', 'target')),
  message     text        NOT NULL,   -- línea lista para el correo, ej: "Compra fuerte" o "Llegó a tu precio de salida: US$1.089,00"
  price       numeric,
  -- Fecha en horario de Chile (no UTC) — así "hoy" en el correo coincide con
  -- el día que el usuario realmente vive, sin importar a qué hora UTC corrió el cron.
  signal_date date        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Santiago')::date),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_daily_signals"
  ON public.daily_signals FOR SELECT
  USING (auth.uid() = user_id);
-- Solo lectura para el propio usuario; el cron (service role) escribe y bypassea RLS.

CREATE INDEX IF NOT EXISTS daily_signals_user_date_idx ON public.daily_signals(user_id, signal_date);

-- Evita duplicar la misma señal si el cron de sync-prices corre más de una vez
-- el mismo día (reintentos, redeploy, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS daily_signals_dedupe_idx
  ON public.daily_signals(user_id, ticker, kind, signal_date);
