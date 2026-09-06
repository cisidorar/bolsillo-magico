-- Recordatorio automático de luz/agua (sep 2026): Cas no sabe con exactitud
-- en qué fecha sale cada boleta, así que la app genera sola un cobro
-- "estimado" (mismo día del mes siguiente al último vencimiento real, con el
-- monto de la última boleta) apenas paga o carga la anterior. El objetivo no
-- es adivinar el monto ni la fecha real — es que exista una fila con
-- vencimiento en property_charges para que el sistema de alertas ya
-- construido (vencidas / por vencer, UX5) le avise el plazo máximo antes de
-- que tenga que ir a buscar la boleta real al portal de la distribuidora.
--
-- `is_estimate` es el dato genuino que falta para distinguir ese cobro
-- placeholder de una boleta real ya cargada — sin esto, saveUtilityBill no
-- tiene cómo saber si debe reemplazar una fila existente o insertar una
-- nueva (ver lib/property-charges.ts: nextUtilityDueDate/utilityReminderRef).
ALTER TABLE public.property_charges
  ADD COLUMN IF NOT EXISTS is_estimate boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_charges TO authenticated;
