-- ── Aún más decimales para el número de acciones ──────────────────────────────
-- numeric(16,6) (ago 2026) se quedaba corto de nuevo: brokers de fracciones
-- devuelven cantidades como 4,61686086 (8 decimales). Se amplía a
-- numeric(18,8) en las tres tablas que guardan cantidad de acciones —
-- cambio no destructivo, los valores existentes ya caben.

ALTER TABLE public.stock_positions ALTER COLUMN shares       TYPE numeric(18,8);
ALTER TABLE public.stock_purchases ALTER COLUMN shares       TYPE numeric(18,8);
ALTER TABLE public.stock_sales     ALTER COLUMN shares_sold  TYPE numeric(18,8);
