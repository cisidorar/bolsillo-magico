-- =============================================
-- MIGRACIÓN: Soporte de gastos en cuotas
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS total_installments  integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_installments   integer DEFAULT 0;

-- total_installments NULL = recurrente indefinido (comportamiento actual)
-- total_installments > 0 = gasto en cuotas con N pagos totales
-- paid_installments se incrementa cada vez que se registra el gasto
