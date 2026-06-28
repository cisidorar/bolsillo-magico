-- ── Inversiones: acciones y depósitos a plazo ────────────────────────────────

-- Posiciones en acciones (mercado US)
CREATE TABLE IF NOT EXISTS public.stock_positions (
  id           uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid          REFERENCES auth.users NOT NULL,
  ticker       text          NOT NULL,
  shares       numeric(12,4) NOT NULL CHECK (shares > 0),
  avg_cost_usd numeric(12,2) NOT NULL CHECK (avg_cost_usd > 0),
  notes        text,
  created_at   timestamptz   DEFAULT now(),
  updated_at   timestamptz   DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.stock_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their stock positions"
  ON public.stock_positions
  FOR ALL
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_positions TO authenticated;

-- Depósitos a plazo
CREATE TABLE IF NOT EXISTS public.term_deposits (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid         REFERENCES auth.users NOT NULL,
  bank          text         NOT NULL,
  amount        integer      NOT NULL CHECK (amount > 0),
  interest_rate numeric(5,2) NOT NULL CHECK (interest_rate >= 0),
  start_date    date         NOT NULL,
  maturity_date date         NOT NULL CHECK (maturity_date > start_date),
  notes         text,
  created_at    timestamptz  DEFAULT now()
);

ALTER TABLE public.term_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their term deposits"
  ON public.term_deposits
  FOR ALL
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.term_deposits TO authenticated;
