-- Nombre completo para documentos (PDF, avisos a terceros). `display_name` sigue
-- siendo el nombre corto con que la app te saluda.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
