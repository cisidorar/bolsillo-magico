-- Cas (nov 2026): "uno para cerrarlo y sacar el dinero como en los bancos".
-- withdrawn_at = fecha en que se retiró el depósito (capital + interés salieron
-- de la inversión). NULL = sigue vivo. No se borra la fila: queda en el historial.
alter table public.term_deposits add column if not exists withdrawn_at date;
