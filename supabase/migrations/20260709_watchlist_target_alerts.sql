-- ── Dirección explícita del precio objetivo + aviso por correo ───────────────
-- Bug real: sin esto, "objetivo alcanzado" se infería según si tenías posición
-- (con posición → sube; sin posición → baja). Rompe con objetivos de entrada
-- por RUPTURA (comprar cuando SUBE a X, ej. NVDA rompiendo resistencia) — el
-- sistema los marcaba como "alcanzado" apenas el precio estaba por debajo.
-- Ahora la dirección se guarda explícita al definir el objetivo.

ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS target_direction text CHECK (target_direction IN ('above', 'below')),
  ADD COLUMN IF NOT EXISTS target_notified  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.watchlist.target_direction IS
  'above = avisar cuando el precio SUBE hasta target_price (ruptura/toma de ganancias); below = avisar cuando BAJA hasta ahí (compra en caída/stop-loss). Se recalcula cada vez que se edita el objetivo.';
COMMENT ON COLUMN public.watchlist.target_notified IS
  'true una vez que se envió el correo de aviso para el target_price actual. Se resetea a false al editar el objetivo, para que un nuevo target vuelva a avisar.';

-- ── Preferencia de notificación (mismo patrón que notify_billing/notify_budget/notify_recurring) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_watchlist_target boolean NOT NULL DEFAULT true;
