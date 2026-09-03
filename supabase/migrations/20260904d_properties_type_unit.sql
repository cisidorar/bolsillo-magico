ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS property_type text CHECK (property_type IN ('departamento','casa')),
  ADD COLUMN IF NOT EXISTS unit_number text;
