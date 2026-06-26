-- Insights mensuales generados por IA
CREATE TABLE IF NOT EXISTS public.monthly_insights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  month           integer not null check (month between 1 and 12),
  year            integer not null check (year >= 2024),
  type            text not null,
  title           text not null,
  description     text not null,
  impact_amount   integer,
  severity        text check (severity in ('low', 'medium', 'high')),
  confidence      numeric(4,3),
  expense_ids     uuid[] default '{}',
  action_label    text,
  action          text,
  -- Cache control
  expenses_hash   text,      -- hash simple: total_amount::count para invalidar cache
  generated_at    timestamptz default now(),
  status          text default 'active' check (status in ('active', 'dismissed'))
);

ALTER TABLE public.monthly_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own insights"
  ON public.monthly_insights FOR ALL
  USING (auth.uid() = user_id);

-- Índice para query rápida por usuario/mes
CREATE INDEX IF NOT EXISTS monthly_insights_user_month
  ON public.monthly_insights (user_id, year, month);
