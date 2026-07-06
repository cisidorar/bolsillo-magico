-- ── Revertir Color de acento e Inicio de semana ──────────────────────────────
-- Ambas preferencias se retiraron del producto (ver docs/SETTINGS_DESIGN.md
-- y conversación de soporte: el selector de acento y el toggle de inicio de
-- semana se descartaron). IF EXISTS hace este DROP seguro incluso si la
-- migración 20260708_settings_preferences.sql nunca llegó a aplicarse.
--
-- payday_last_business_day: nueva opción para "Día de sueldo" — el sueldo
-- cae el último día hábil (lunes a viernes) del mes en vez de un día fijo.
-- Cuando es true, el día efectivo se calcula dinámicamente por mes
-- (ver lib/utils.ts:lastBusinessDay) y la columna payday se ignora.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS accent_color,
  DROP COLUMN IF EXISTS week_start,
  ADD COLUMN IF NOT EXISTS payday_last_business_day boolean NOT NULL DEFAULT false;
