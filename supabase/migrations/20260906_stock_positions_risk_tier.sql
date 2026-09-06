-- Gráfico de riesgo de la cartera (sep 2026, a pedido de Cas): "riesgo /
-- riesgo alto / bajo riesgo" no se puede derivar de ningún dato que ya
-- tengamos (price_cache no trae sector ni tipo de activo), así que
-- lib/risk-tiers.ts clasifica por una lista curada (mismo patrón que
-- lib/leveraged-etfs.ts). Esta columna es el override: si Cas no está de
-- acuerdo con la clasificación por defecto de un ticker (ej. considera IBIT
-- "riesgo" y no "riesgo alto"), lo corrige acá una vez y queda. NULL = "sin
-- corregir, usa el default curado" — nunca "sin clasificar", ver
-- effectiveRiskTier().
ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS risk_tier text CHECK (risk_tier IN ('bajo', 'medio', 'alto'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_positions TO authenticated;
