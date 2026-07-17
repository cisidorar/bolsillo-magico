-- Trailing stop persistido por posición — jul 2026
--
-- El alarm del análisis técnico se recalcula cada día desde soportes/SMA50/
-- chandelier y PUEDE BAJAR cuando esos niveles bajan. Un trailing stop de
-- verdad solo sube: el cron diario (sync-prices) calcula el alarm del día y
-- guarda aquí el MÁXIMO histórico mientras la posición viva. Se resetea al
-- alarm vigente cuando se compra más (la posición cambió de perfil) y se
-- borra junto con la fila al vender todo.
--
-- NULL = todavía sin cálculo (posición nueva, o el cron aún no corre).

alter table public.stock_positions
  add column if not exists trail_stop_usd numeric(12,2) default null;

comment on column public.stock_positions.trail_stop_usd is
  'Trailing stop en USD: máximo histórico del alarm técnico diario. Solo sube (ratchet); se resetea al comprar más. Lo escribe el cron sync-prices.';
