-- ── Más decimales para el número de acciones ──────────────────────────────────
-- numeric(12,4) se quedaba corto para brokers que permiten acciones
-- fraccionadas con más precisión (ej. 0,338245). Se amplía a numeric(16,6) en
-- las tres tablas que guardan cantidad de acciones — cambio no destructivo,
-- los valores existentes ya caben.

ALTER TABLE public.stock_positions ALTER COLUMN shares       TYPE numeric(16,6);
ALTER TABLE public.stock_purchases ALTER COLUMN shares       TYPE numeric(16,6);
ALTER TABLE public.stock_sales     ALTER COLUMN shares_sold  TYPE numeric(16,6);
