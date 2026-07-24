-- ── Ciclo de sueldo: día de pago del estado de cuenta ─────────────────────
-- billing_day ya existe (día de CORTE). payment_due_day es el día del mes
-- SIGUIENTE en que vence el pago del estado ya cerrado (ej: CMR corta el 24,
-- vence el 5 del mes siguiente → billing_day=24, payment_due_day=5).
-- Null = no configurado (tarjetas de débito/efectivo/digital no lo usan;
-- tarjetas de crédito existentes tampoco hasta que el usuario lo complete).
-- Usado por la card "Ciclo de sueldo" en /inicio para saber cuánto de la
-- próxima tarjeta ya está comprometido cuando llega el sueldo.

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS payment_due_day integer
    CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31);
