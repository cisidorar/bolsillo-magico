-- ============================================================
-- Informe semanal (S5, persistencia): snapshot semanal por usuario +
-- flag de opt-in para el correo. Antes el informe (/inversiones?view=semanal)
-- solo se calculaba en vivo al abrir la página, sin historia ni envío
-- automático — igual que daily_decisions le dio persistencia al panel
-- "¿Qué comprar hoy?", esta tabla hace lo mismo para el informe semanal.
--
-- payload guarda TODO lo que necesita el correo (Deno no puede importar
-- lib/technical.ts ni el resto de los cálculos de Next/Node) — mismo patrón
-- que daily_signals/daily_decisions: el cron de Vercel calcula UNA vez con
-- las funciones puras de lib/, la Edge Function de Supabase solo lee y arma
-- el HTML, no recalcula nada.
-- ============================================================

create table if not exists public.weekly_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  week_start    date not null,   -- lunes de la semana del informe (hora Chile)
  payload       jsonb not null,  -- items[], spyBenchmark, macro, todayDecision, todaySignals, skippedTickers, generatedAt
  generated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reports enable row level security;

create policy "select own weekly_reports"
  on public.weekly_reports for select
  using (auth.uid() = user_id);

-- Sin policy de insert/update para usuarios: solo el cron (service role,
-- que no pasa por RLS) escribe acá.

alter table public.profiles
  add column if not exists notify_weekly_report boolean not null default true;
