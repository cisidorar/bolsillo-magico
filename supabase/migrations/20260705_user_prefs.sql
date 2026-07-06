-- ── Preferencias de personalización del usuario ──────────────────────────────
-- budget_alert_pct: umbral de la primera alerta de presupuesto (antes fijo en 80%)
-- payday: día del mes en que llega el sueldo (opcional) — cuenta regresiva en inicio
--         y base para el futuro calendario de flujo de caja (F8)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_alert_pct integer NOT NULL DEFAULT 80
    CHECK (budget_alert_pct BETWEEN 50 AND 95),
  ADD COLUMN IF NOT EXISTS payday integer
    CHECK (payday BETWEEN 1 AND 31);
