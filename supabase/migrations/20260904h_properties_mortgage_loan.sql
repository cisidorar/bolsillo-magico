-- Detalle del crédito hipotecario, más allá del monto mensual.
--
-- `mortgage_amount`/`mortgage_due_day` (de la migración base) alcanzan para
-- generar el cobro de cada mes, pero no dicen nada de la deuda en sí: cuánto
-- capital queda, a qué tasa, ni cuándo termina. Esa info sale directo del
-- portal del banco y no cambia seguido, así que va en `properties` — no es
-- una obligación con vencimiento propio como sí lo es cada cuota.
--
-- Cuotas pagadas/pendientes NO se guardan acá: se derivan contando los
-- property_charges kind='mortgage' con paid_date, igual que el resto del
-- módulo (nada que dependa de "qué día es hoy" se almacena, ver
-- property-charges.ts). Guardar un contador aparte lo dejaría desincronizado
-- apenas se agregue o borre una cuota a mano.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS mortgage_principal          integer CHECK (mortgage_principal >= 0),
  ADD COLUMN IF NOT EXISTS mortgage_rate                numeric CHECK (mortgage_rate >= 0),
  ADD COLUMN IF NOT EXISTS mortgage_grace_months        integer CHECK (mortgage_grace_months >= 0),
  ADD COLUMN IF NOT EXISTS mortgage_total_installments  integer CHECK (mortgage_total_installments > 0),
  ADD COLUMN IF NOT EXISTS mortgage_signed_date         date,
  ADD COLUMN IF NOT EXISTS mortgage_end_date            date;
