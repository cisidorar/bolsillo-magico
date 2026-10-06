-- ── Fix: índice parcial rompía el ON CONFLICT de auto-register ──────────────
-- Cas: "el 29 tocaba spotify y de nuevo no se registró". Causa real: el
-- upsert de auto-register.ts usa onConflict: 'user_id,recurring_expense_id,date',
-- pero el índice único (creado en 20260717_auto_register_idempotent.sql) era
-- PARCIAL (WHERE recurring_expense_id IS NOT NULL). Postgres solo puede usar
-- un índice parcial como árbitro de ON CONFLICT si la cláusula ON CONFLICT
-- repite ese WHERE, y el cliente JS de Supabase no tiene forma de expresarlo.
-- Resultado: TODO upsert "normal" o "cada N meses" fallaba en silencio con
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- (92 fallos en 7 días, 6 usuarios afectados — no solo Spotify, no solo Cas).
--
-- Fix: mismo índice, sin el WHERE. Semánticamente no cambia nada (NULL nunca
-- es igual a NULL en un índice único, así que los gastos no-recurrentes
-- siguen sin restricción), pero ahora el ON CONFLICT (user_id,
-- recurring_expense_id, date) sí puede usarlo de árbitro.

DROP INDEX IF EXISTS expenses_recurring_once_per_day_idx;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_once_per_day_idx
  ON public.expenses(user_id, recurring_expense_id, date);
