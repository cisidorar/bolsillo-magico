-- Aviso por correo a los admins cuando llega una solicitud nueva a la lista de espera
-- (edge function notify-waitlist). Esta columna marca qué solicitudes ya se avisaron,
-- así la función es idempotente: llamarla de más no manda correos de más.
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS notified_at timestamptz;
-- Las que ya existían no se avisan retroactivamente.
UPDATE public.waitlist SET notified_at = now() WHERE notified_at IS NULL;
