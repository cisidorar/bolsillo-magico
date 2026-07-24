-- ── Meta de aporte mensual a inversión (Fase A1/A2 del asesor financiero) ────
-- monthly_invest_goal: cuánto CLP quiere destinar el usuario a inversión (USD
-- wallet / acciones) cada mes. Se usa en /analisis para separar el flujo del
-- mes en gastado / invertido / líquido, medir cumplimiento y ajustar el
-- health score. NULL = el usuario no ha definido una meta todavía (no se
-- fuerza un default en cuentas existentes: se pide explícitamente en la UI).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_invest_goal integer
    CHECK (monthly_invest_goal IS NULL OR monthly_invest_goal >= 0);
