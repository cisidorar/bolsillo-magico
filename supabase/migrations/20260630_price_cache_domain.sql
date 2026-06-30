-- Agrega columna domain a price_cache para guardar el sitio web de la empresa
ALTER TABLE public.price_cache ADD COLUMN IF NOT EXISTS domain text;
