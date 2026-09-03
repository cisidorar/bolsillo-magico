-- Agrega campos de número de cliente para luz y agua.
-- Estos son solo identificadores (NHE de Enel, número de cuenta Aguas).
-- Se usan para futura consulta automática de boletas (P3).
-- No guardamos contraseñas ni datos sensibles — solo el ID que el dueño
-- necesita para descargar su boleta.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS electricity_client_id text,
  ADD COLUMN IF NOT EXISTS water_client_id text;
