-- Cuentas de ahorro con tasa de interés diaria (TAE/APY)
-- Distintas de los depósitos a plazo: no tienen fecha de vencimiento,
-- el interés se acumula cada día mientras el saldo permanece.

CREATE TABLE IF NOT EXISTS public.savings_accounts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  balance      integer     NOT NULL CHECK (balance >= 0),  -- CLP, sin decimales
  annual_rate  numeric(8,4) NOT NULL CHECK (annual_rate >= 0),  -- % TAE, ej: 12.5
  start_date   date        NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own savings_accounts"
  ON public.savings_accounts
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índice
CREATE INDEX IF NOT EXISTS savings_accounts_user_id_idx
  ON public.savings_accounts(user_id);
