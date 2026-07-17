-- Decisión diaria de portafolio (Fase 5.4 del roadmap de inversiones) — jul 2026
--
-- Hasta ahora el digest lista señales por ticker, una por una — el correo
-- nunca dice explícitamente "esto es lo que harías hoy". Esta tabla guarda,
-- UNA fila por usuario por día, el veredicto comparado entre todos sus
-- favoritos (mismo cálculo que el panel "¿Qué comprar hoy?" de la app,
-- lib/conviction.ts): la mejor compra del día con su monto sugerido, o la
-- ausencia explícita de una ("no compres nada hoy").
--
-- La llena /api/cron/sync-prices (Vercel) después de calcular daily_signals
-- — reutiliza los mismos analyze() ya calculados, no hace trabajo extra.
-- La lee la Edge Function notify-watchlist-digest para abrir el correo con
-- la decisión en vez de con la lista de señales.

CREATE TABLE IF NOT EXISTS public.daily_decisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_date date        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Santiago')::date),
  ticker        text,                    -- null = "no compres nada hoy"
  tier          text,                    -- compra_fuerte/compra/neutral/evitar/venta — solo si ticker no es null
  score         int,                     -- 0-100
  suggested_usd numeric(12,2),           -- monto sugerido (regla del 1%, topado al efectivo disponible) — null si no aplica
  verdict       text        NOT NULL,    -- frase lista para mostrar
  reasons       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_daily_decisions"
  ON public.daily_decisions FOR SELECT
  USING (auth.uid() = user_id);
-- Solo lectura para el propio usuario; el cron (service role) escribe y bypassea RLS.

-- Una decisión por usuario por día — el cron hace upsert si corre más de una vez.
CREATE UNIQUE INDEX IF NOT EXISTS daily_decisions_dedupe_idx
  ON public.daily_decisions(user_id, decision_date);

GRANT ALL ON public.daily_decisions TO service_role;
