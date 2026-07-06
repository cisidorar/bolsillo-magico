-- ── Fase 3: días de anticipación del aviso de cierre de tarjeta ──────────────
-- Antes fijo en 1-2 días dentro de notify-billing; ahora configurable por usuario.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_alert_days integer NOT NULL DEFAULT 2
    CHECK (billing_alert_days BETWEEN 1 AND 7);
