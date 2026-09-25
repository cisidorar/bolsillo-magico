-- Cadencia "cada N meses" para recurrentes que no caen mes a mes ni son un
-- cobro anual de mes fijo — ej: comida de perro comprada cada ~2 meses, en
-- montos que varían (no un cargo fijo de suscripción). El modelo previo solo
-- soportaba mensual (billing_day) o anual (billing_month): forzar algo así
-- en mensual generaba "atrasado" falso la mitad de los meses.
--
-- interval_months = 1 (default) = comportamiento actual, sin cambios.
-- interval_months > 1 solo aplica a items no-cuota, no-anual (billing_month
-- null, total_installments null) — se ancla a la fecha del último gasto
-- real vinculado, no a un día fijo del mes (ver lib/recurring-due.ts,
-- intervalDueDate).
alter table recurring_expenses
  add column if not exists interval_months integer not null default 1;

alter table recurring_expenses
  add constraint recurring_expenses_interval_months_check
  check (interval_months between 1 and 11);

comment on column recurring_expenses.interval_months is
  'Cadencia en meses (1=mensual, N=cada N meses). Solo relevante cuando billing_month es null y total_installments es null; se ancla al último gasto real, no a un día fijo del mes.';
