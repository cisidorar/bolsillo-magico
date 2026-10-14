-- Costo promedio con 6 decimales (antes 2). Con 2 decimales, acciones x costo
-- promedio no reproducía el costo real: KO daba $1.105,71 contra $1.105,77
-- pagados. La columna "Costo" de Mis acciones (formato Racional) tiene que
-- cuadrar al centavo con la suma de las compras.
alter table stock_positions alter column avg_cost_usd type numeric(14,6);
