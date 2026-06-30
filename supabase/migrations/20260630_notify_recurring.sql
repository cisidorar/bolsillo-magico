-- Preferencia de notificación para recordatorios de gastos recurrentes manuales
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_recurring boolean NOT NULL DEFAULT true;
