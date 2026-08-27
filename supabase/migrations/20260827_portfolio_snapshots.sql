-- ── Curva diaria del valor de la cartera de acciones (pedido de Cas, ago 2026) ──
-- A diferencia de lib/portfolio-history.ts (computePortfolioHistory, que
-- RECONSTRUYE el pasado con las posiciones de HOY hacia atrás — aproximación,
-- no un registro real), esta tabla guarda desde hoy en adelante el valor REAL
-- de cada día: posiciones valorizadas al cierre de ESE día + saldo de la
-- billetera USD disponible ese día. La llena el cron diario de sync-prices
-- (app/api/cron/sync-prices/route.ts, snapshotAllPortfolioValues) en cada día
-- hábil NYSE, después de sincronizar los precios de cierre.

create table if not exists public.portfolio_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  snapshot_date     date not null,
  stocks_value_usd  numeric not null,
  wallet_usd        numeric not null,
  total_usd         numeric not null,
  created_at        timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists portfolio_snapshots_user_date_idx
  on public.portfolio_snapshots (user_id, snapshot_date desc);

alter table public.portfolio_snapshots enable row level security;

create policy "select own portfolio snapshots"
  on public.portfolio_snapshots for select
  using (auth.uid() = user_id);

-- Sin policy de insert/update/delete para usuarios: solo el cron (service
-- role, que bypassa RLS) escribe acá — mismo criterio que net_worth_snapshots.
