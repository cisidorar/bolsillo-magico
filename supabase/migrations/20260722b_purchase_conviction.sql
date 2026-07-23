-- Memoria de la decisión al comprar (D5 del roadmap de calidad de decisión) — jul 2026
--
-- stock_purchases guardaba ticker, acciones y monto — pero no la LECTURA con
-- la que se decidió (score de convicción, tier, si había gatillo de entrada
-- activo). Sin eso no hay aprendizaje posible: no se puede revisar "¿me fue
-- mejor comprando con score 80 que con 60?" ni distinguir una compra que
-- siguió el plan de una por impulso. Las métricas de ventas cerradas (Fase
-- 2.1) miden el resultado, pero no lo cruzan con la calidad de la entrada.
--
-- Columnas nullable: compras ya registradas quedan sin este dato (no se
-- puede reconstruir retroactivamente, el análisis del momento ya no existe),
-- y compras nuevas registradas sin análisis cargado (caso borde) tampoco
-- deberían fallar por esto.

ALTER TABLE public.stock_purchases
  ADD COLUMN IF NOT EXISTS conviction_score    int,       -- 0-100 al momento de la compra
  ADD COLUMN IF NOT EXISTS conviction_tier     text,      -- compra_fuerte/compra/neutral/evitar/venta
  ADD COLUMN IF NOT EXISTS had_entry_trigger   boolean;   -- ¿el gráfico daba gatillo de entrada ese día? (isActionableBuyNow)
