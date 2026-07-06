-- ── F4: Patrimonio neto en el tiempo ─────────────────────────────────────────
-- Snapshot mensual del valor de los activos del usuario.
-- El mes en curso se actualiza (upsert) en cada visita a /analisis;
-- los meses pasados quedan congelados como historia.

CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month        integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         integer     NOT NULL CHECK (year >= 2020),
  stocks_clp   integer     NOT NULL DEFAULT 0,  -- acciones valorizadas a precio de mercado (o costo si no hay precio)
  deposits_clp integer     NOT NULL DEFAULT 0,  -- depósitos a plazo: capital + interés devengado
  savings_clp  integer     NOT NULL DEFAULT 0,  -- cuentas de ahorro: saldo + interés compuesto acumulado
  total_clp    integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own net worth snapshots"
  ON public.net_worth_snapshots
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.net_worth_snapshots TO authenticated;

CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_idx
  ON public.net_worth_snapshots(user_id, year, month);
