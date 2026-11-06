-- Pagos de propiedad que son costo del dueño (aseo, contribuciones, reparaciones...) también quedan como gasto.
-- expense_id enlaza el cobro con su gasto: al deshacer el pago se borra el gasto; si borras el gasto a mano, el enlace queda en null.
ALTER TABLE public.property_charges
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS property_charges_expense_idx ON public.property_charges(expense_id) WHERE expense_id IS NOT NULL;
