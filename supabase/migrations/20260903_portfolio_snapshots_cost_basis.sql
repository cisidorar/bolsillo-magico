-- ── Costo invertido en la curva del portafolio (pedido de Cas, sep 2026) ────
-- "me gustaría que la línea gris fuera lo invertido y la verde estuviera
-- acorde a las ganancias respecto a eso".
--
-- Hasta ahora la línea gris del gráfico era la serie acumulada de APORTES a la
-- billetera (usd_purchases kind='deposit'), que no es lo invertido: incluye
-- plata que todavía está en efectivo y no refleja el costo de las posiciones.
-- Con esta columna la brecha entre las dos líneas pasa a ser exactamente la
-- ganancia no realizada.
--
-- No se puede reconstruir hacia atrás desde stock_purchases/stock_sales: hay
-- posiciones legacy sin fila de compra (las compras registradas suman
-- US$3.900 mientras las posiciones cuestan US$5.443), así que la serie
-- arrancaría muy por debajo de la realidad. Se guarda día a día desde ahora,
-- igual que ya se hace con stocks_value_usd — las dos líneas comparten el
-- mismo punto de partida, así que el gráfico queda consistente.
--
-- Nullable a propósito: las filas anteriores a este cambio no lo tienen y el
-- gráfico simplemente no dibuja gris para esos días.
ALTER TABLE public.portfolio_snapshots
  ADD COLUMN IF NOT EXISTS cost_basis_usd numeric;

COMMENT ON COLUMN public.portfolio_snapshots.cost_basis_usd IS
  'Σ shares × avg_cost_usd de las posiciones abiertas ese día (lo invertido, sin el efectivo de la billetera). Null en filas anteriores a sep 2026.';
