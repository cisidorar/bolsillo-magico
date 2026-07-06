-- ── Preferencias de personalización — Fase 4 (mockup Ajustes) ────────────────
-- accent_color: acento visual de la app (mapea a valores light/dark en lib/accent-colors.ts)
-- language:     idioma de la interfaz. Hoy solo 'es-CL' tiene textos reales;
--               el resto se ofrece deshabilitado en la UI ("Próximamente").
-- date_format:  formato de fecha para vistas que no usan fechas relativas ("Hoy"/"Ayer").
-- week_start:   primer día de la semana en vistas tipo calendario (CalendarioPagos).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT 'blue'
    CHECK (accent_color IN ('blue', 'mint', 'purple', 'gold')),
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es-CL',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'DD/MM/AAAA'
    CHECK (date_format IN ('DD/MM/AAAA', 'MM/DD/AAAA', 'AAAA-MM-DD')),
  ADD COLUMN IF NOT EXISTS week_start text NOT NULL DEFAULT 'monday'
    CHECK (week_start IN ('monday', 'sunday'));
