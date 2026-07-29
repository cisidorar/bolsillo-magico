-- ── E3 (roadmap economía personal, jul 2026): metas de ahorro con nombre y fecha ──
-- Hoy la app tiene tasa de ahorro y fondo de emergencia (meses de cobertura),
-- todo abstracto — no existe "quiero juntar $900.000 para diciembre".
-- current_amount se actualiza a mano (no está ligado a savings_accounts ni a
-- ningún saldo real): igual que month_sweeps, esto es seguimiento explícito,
-- no mueve plata por sí solo.

CREATE TABLE IF NOT EXISTS public.savings_goals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  target_amount  integer     NOT NULL CHECK (target_amount > 0),
  current_amount integer     NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date    date,
  icon           text        NOT NULL DEFAULT 'PiggyBank',
  color          text        NOT NULL DEFAULT '#1FBE8D',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own savings_goals"
  ON public.savings_goals
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS savings_goals_user_id_idx ON public.savings_goals(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
