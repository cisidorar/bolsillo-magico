-- Dividendos e intereses entran a la billetera USD igual que en Racional
-- (cartola: "Dividendo TSM", "Intereses Stock Boost"). Cas, comparando la
-- cartola del bróker contra la app: faltaban esos movimientos, así que el
-- saldo y el historial no podían cuadrar. El ticker del dividendo vive en
-- notes ("Dividendo TSM"), igual que "Venta GOOGL" en las ventas.
alter table usd_purchases drop constraint if exists usd_purchases_kind_check;
alter table usd_purchases
  add constraint usd_purchases_kind_check
  check (kind = any (array['deposit'::text, 'sell'::text, 'dividend'::text, 'interest'::text]));
