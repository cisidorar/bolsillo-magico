-- ── Verificador de setup ─────────────────────────────────────────────────────
-- Ejecuta esto en Supabase → SQL Editor. Cada fila dice si un objeto que la
-- app necesita existe (ok = true). Lo que salga en false → busca la migración
-- correspondiente en supabase/migrations/ y aplícala.
-- Nota: supabase/schema.sql está congelado (jun 2026, 8 tablas base) — la
-- fuente de verdad del esquema son las migraciones en orden cronológico.

SELECT * FROM (
  -- Tablas base
  SELECT 01 AS orden, 'tabla categories'         AS objeto, to_regclass('public.categories')          IS NOT NULL AS ok UNION ALL
  SELECT 02, 'tabla payment_methods',    to_regclass('public.payment_methods')    IS NOT NULL UNION ALL
  SELECT 03, 'tabla expenses',           to_regclass('public.expenses')           IS NOT NULL UNION ALL
  SELECT 04, 'tabla recurring_expenses', to_regclass('public.recurring_expenses') IS NOT NULL UNION ALL
  SELECT 05, 'tabla budgets',            to_regclass('public.budgets')            IS NOT NULL UNION ALL
  SELECT 06, 'tabla category_budgets',   to_regclass('public.category_budgets')   IS NOT NULL UNION ALL
  SELECT 07, 'tabla profiles',           to_regclass('public.profiles')           IS NOT NULL UNION ALL
  SELECT 08, 'tabla incomes',            to_regclass('public.incomes')            IS NOT NULL UNION ALL
  -- Inversiones
  SELECT 10, 'tabla stock_positions',     to_regclass('public.stock_positions')     IS NOT NULL UNION ALL
  SELECT 11, 'tabla savings_accounts',    to_regclass('public.savings_accounts')    IS NOT NULL UNION ALL
  SELECT 12, 'tabla term_deposits',       to_regclass('public.term_deposits')       IS NOT NULL UNION ALL
  SELECT 13, 'tabla net_worth_snapshots', to_regclass('public.net_worth_snapshots') IS NOT NULL UNION ALL
  SELECT 14, 'tabla price_cache',         to_regclass('public.price_cache')         IS NOT NULL UNION ALL
  SELECT 15, 'tabla price_history',       to_regclass('public.price_history')       IS NOT NULL UNION ALL
  SELECT 16, 'tabla watchlist',           to_regclass('public.watchlist')           IS NOT NULL UNION ALL
  SELECT 17, 'tabla usd_purchases',       to_regclass('public.usd_purchases')       IS NOT NULL UNION ALL
  SELECT 18, 'tabla stock_sales',         to_regclass('public.stock_sales')         IS NOT NULL UNION ALL
  SELECT 19, 'tabla stock_purchases',     to_regclass('public.stock_purchases')     IS NOT NULL UNION ALL
  SELECT 20, 'tabla daily_signals',       to_regclass('public.daily_signals')       IS NOT NULL UNION ALL
  SELECT 21, 'tabla monthly_insights',    to_regclass('public.monthly_insights')    IS NOT NULL UNION ALL
  SELECT 22, 'tabla month_sweeps',        to_regclass('public.month_sweeps')        IS NOT NULL UNION ALL
  -- Columnas agregadas por migraciones posteriores
  SELECT 30, 'columna net_worth_snapshots.usd_clp', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'net_worth_snapshots' AND column_name = 'usd_clp') UNION ALL
  SELECT 31, 'columna usd_purchases.kind', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usd_purchases' AND column_name = 'kind') UNION ALL
  SELECT 32, 'columna stock_positions.wallet_funded', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_positions' AND column_name = 'wallet_funded') UNION ALL
  SELECT 33, 'columna stock_positions.wallet_cost_usd', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_positions' AND column_name = 'wallet_cost_usd') UNION ALL
  SELECT 34, 'columna watchlist.target_price', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'watchlist' AND column_name = 'target_price') UNION ALL
  SELECT 35, 'columna watchlist.target_direction', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'watchlist' AND column_name = 'target_direction') UNION ALL
  -- Índices de integridad
  SELECT 40, 'índice expenses_recurring_once_per_day_idx (AutoRegister idempotente)', EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'expenses_recurring_once_per_day_idx')
) checks
ORDER BY orden;
