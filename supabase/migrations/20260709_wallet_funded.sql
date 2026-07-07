-- ── Posiciones legacy vs financiadas por la billetera ───────────────────────
-- Las posiciones registradas ANTES de usar la billetera USD no se compraron
-- con esos aportes: no deben descontar del saldo disponible (caso real: 1
-- aporte de US$1.064 quedaba en US$0 por acciones antiguas de US$2.940).
-- default false → todo lo existente queda como legacy automáticamente;
-- las compras nuevas con billetera activa se insertan con true.

ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS wallet_funded boolean NOT NULL DEFAULT false;
