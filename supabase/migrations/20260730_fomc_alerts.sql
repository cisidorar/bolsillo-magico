-- ============================================================
-- Aviso "la Fed decide tasas en 7 días" (a pedido de Cas, jul 2026, tras el
-- FOMC del 29 jul). Mismo patrón que weekly_reports/daily_decisions: el
-- cálculo (nextFomcMeeting + rate-path + fedRateSentence, todo en lib/) vive
-- en el cron de Vercel (Node) y se persiste acá; la Edge Function de Supabase
-- (Deno, no puede importar lib/market-week.ts ni lib/rate-path.ts) solo lee
-- esta tabla y arma el correo.
--
-- Datos públicos (la tasa de la Fed es la misma para todos los usuarios) —
-- sin user_id, misma filosofía que price_cache.
-- ============================================================

create table if not exists public.fomc_alerts (
  meeting_date   date primary key,
  sentence       text not null,      -- output de fedRateSentence(dffObs, ratePath) — ya redactado, sin reprocesar
  direction      text not null,      -- 'alzas' | 'estable' | 'bajas' (lib/rate-path.ts) — para el tono del correo
  implied_moves  integer not null,   -- movimientos de 25pb que el mercado tiene en precio, con signo
  computed_at    timestamptz not null default now()
);

alter table public.fomc_alerts enable row level security;

-- Igual que price_cache: dato de mercado público, cualquier usuario
-- autenticado puede leer (y el cron, con service role, escribe sin pasar
-- por RLS de todas formas).
create policy "Authenticated users read fomc alerts"
  on public.fomc_alerts
  for select
  to authenticated
  using (true);

grant select on public.fomc_alerts to authenticated;

alter table public.profiles
  add column if not exists notify_fomc boolean not null default true;
