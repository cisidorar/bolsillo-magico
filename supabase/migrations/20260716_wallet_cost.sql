-- ── Costo financiado por la billetera, por posición ─────────────────────────
-- wallet_funded (booleano) no alcanza: al "comprar más" de una posición legacy
-- con la billetera activa, esa plata sale de la billetera pero no descontaba
-- (el flag es todo-o-nada por posición) → saldo inflado.
-- wallet_cost_usd = porción del costo de la posición que salió de la billetera.
-- Saldo disponible = Σ movimientos − Σ wallet_cost_usd.
-- Venta parcial reduce wallet_cost_usd proporcionalmente.

ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS wallet_cost_usd numeric(14,2) NOT NULL DEFAULT 0;

-- Backfill: lo ya marcado como financiado queda con su costo completo
UPDATE public.stock_positions
  SET wallet_cost_usd = ROUND(shares * avg_cost_usd, 2)
  WHERE wallet_funded = true AND wallet_cost_usd = 0;
