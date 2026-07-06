-- ── Fase 2 del plan de configuración: presupuesto por mes o por facturación ──
-- budget_period: cómo mide el inicio — mes calendario (default) o período de
--                facturación de la tarjeta de crédito.
-- period_card_id: qué tarjeta define el corte; null = la is_default (o la
--                 primera de crédito con billing_day).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_period text NOT NULL DEFAULT 'calendar'
    CHECK (budget_period IN ('calendar', 'billing')),
  ADD COLUMN IF NOT EXISTS period_card_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;
