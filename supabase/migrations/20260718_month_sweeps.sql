-- ── P2: Sweep de cierre de mes ───────────────────────────────────────────────
-- Registra qué hizo el usuario con el sobrante de un mes ya cerrado (sueldo
-- M-1 financió los gastos de M, según la convención de la app). Sin esto, la
-- tasa de ahorro es puramente descriptiva: dice "sobraron $X" pero nada
-- verifica que ese dinero haya aterrizado en un activo. Cierra el loop
-- flujo → stock reconciliando el surplus contra una decisión explícita.

CREATE TABLE IF NOT EXISTS public.month_sweeps (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month          integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  year           integer     NOT NULL CHECK (year >= 2020),
  surplus_amount integer     NOT NULL,  -- CLP, congelado al momento de la decisión
  decision       text        NOT NULL CHECK (decision IN ('saved', 'wallet_usd', 'kept_liquid', 'dismissed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

ALTER TABLE public.month_sweeps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own month sweeps"
  ON public.month_sweeps
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.month_sweeps TO authenticated;

CREATE INDEX IF NOT EXISTS month_sweeps_user_idx
  ON public.month_sweeps(user_id, year, month);
