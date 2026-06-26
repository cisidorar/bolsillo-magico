-- Ingresos mensuales por usuario
CREATE TABLE IF NOT EXISTS public.incomes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      integer not null check (amount > 0),
  month       integer not null check (month between 1 and 12),
  year        integer not null check (year >= 2020),
  description text,
  created_at  timestamptz default now(),
  unique(user_id, month, year)
);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own incomes"
  ON public.incomes FOR ALL
  USING (auth.uid() = user_id);
