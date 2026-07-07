-- ── Billetera USD como libro de movimientos ─────────────────────────────────
-- usd_purchases pasa a tener dos tipos de fila:
--   kind='deposit' → aporte CLP→USD (total_paid_clp obligatorio en la práctica)
--   kind='sell'    → venta de una posición: los USD vuelven a la billetera
--                    (total_paid_clp NULL — nunca pasó por CLP)
-- Saldo disponible = Σ deposits + Σ sells − Σ costo de posiciones abiertas.
-- Las compras NO se registran como filas: la posición abierta ya representa
-- los USD invertidos (evita doble contabilidad y descuadres).

ALTER TABLE public.usd_purchases
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'deposit'
    CHECK (kind IN ('deposit', 'sell'));

ALTER TABLE public.usd_purchases
  ALTER COLUMN total_paid_clp DROP NOT NULL;
