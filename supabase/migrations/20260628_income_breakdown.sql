-- Agregar desglose opcional de ingresos (múltiples fuentes por mes)
-- Cada item: { label: string, amount: number }
ALTER TABLE public.incomes
  ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '[]';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incomes TO authenticated;
