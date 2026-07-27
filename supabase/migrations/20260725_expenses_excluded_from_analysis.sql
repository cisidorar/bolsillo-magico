-- ── "Marcar como único" — excluir un gasto excepcional del análisis IA ────
-- Un gasto real (viaje, evento puntual) sigue contando en TODOS los totales
-- visibles de la app (historial, análisis, presupuesto vs categoría) — eso
-- es plata que de verdad se gastó, la app no "ajusta" números reales.
-- Lo único que cambia: /api/analyze-month deja de usarlo como evidencia de
-- que una categoría "está sobre presupuesto" o de un patrón de comportamiento
-- (ver CLAUDE.md — el usuario ya lo identificó como excepcional, no repetir
-- el mismo hallazgo mes a mes por un gasto que no va a volver a pasar).
-- Default false: no cambia nada para gastos existentes.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS excluded_from_analysis boolean NOT NULL DEFAULT false;
