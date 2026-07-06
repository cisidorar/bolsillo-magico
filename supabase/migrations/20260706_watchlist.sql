-- ── Watchlist: acciones y ETFs favoritos en seguimiento ─────────────────────
-- Tickers que el usuario sigue sin necesariamente tener posición.
-- Base para el panel de señales técnicas y (fase 2) alertas por email.

CREATE TABLE IF NOT EXISTS public.watchlist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker       text        NOT NULL,
  target_price numeric(12,2),          -- precio objetivo opcional (fase 2: alertas)
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own watchlist"
  ON public.watchlist
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;

CREATE INDEX IF NOT EXISTS watchlist_user_idx ON public.watchlist(user_id);
