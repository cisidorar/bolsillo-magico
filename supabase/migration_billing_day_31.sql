-- Ampliar constraint de billing_day en recurring_expenses: 1-28 → 1-31
-- Algunos servicios cobran el día 29, 30 o 31.
-- La lógica de la app ya hace clamp al último día del mes (Math.min(billing_day, diasDelMes)).

ALTER TABLE public.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_billing_day_check;

ALTER TABLE public.recurring_expenses
  ADD CONSTRAINT recurring_expenses_billing_day_check
    CHECK (billing_day BETWEEN 1 AND 31);
