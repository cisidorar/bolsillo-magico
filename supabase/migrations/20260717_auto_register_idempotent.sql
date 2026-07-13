-- ── AutoRegister idempotente a nivel de BD ──────────────────────────────────
-- El server action deduplica con SELECT-antes-de-INSERT + cookie diaria, pero
-- dos pestañas/dispositivos simultáneos (antes de que la cookie exista) pueden
-- pasar ambos el SELECT y duplicar el gasto recurrente del mes.
-- Índice único parcial: un gasto por (usuario, recurrente, fecha). El perdedor
-- de la carrera falla con 23505 y el action no incrementa cuotas (ya está
-- condicionado a !error). También bloquea duplicar a mano un recurrente ya
-- registrado ese día — comportamiento deseado.

CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_once_per_day_idx
  ON public.expenses(user_id, recurring_expense_id, date)
  WHERE recurring_expense_id IS NOT NULL;
