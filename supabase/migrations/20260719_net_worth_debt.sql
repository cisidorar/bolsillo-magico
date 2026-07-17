-- ── P1 (fix real): Patrimonio neto REAL historizado ──────────────────────────
-- Hasta ahora net_worth_snapshots solo guardaba el patrimonio BRUTO
-- (stocks + deposits + savings + usd). La resta de deuda comprometida
-- (cuotas pendientes + tarjeta por facturar) vivía solo en la UI
-- (PatrimonioCards "Neto real"), nunca se persistía — el histórico y el
-- gráfico de evolución medían bruto, premiando endeudarse (comprar en
-- cuotas infla la curva) y sin registrar el efecto positivo de pagar deuda.
--
-- Estas dos columnas permiten que computeAndSnapshotNetWorth() guarde
-- también la deuda del mes y el neto real, para que la curva de evolución
-- y cualquier análisis futuro reflejen el patrimonio real. Nullable porque
-- los snapshots históricos anteriores a este fix no tienen este dato
-- (no se recalculan: los meses pasados quedan congelados por diseño).

ALTER TABLE public.net_worth_snapshots
  ADD COLUMN IF NOT EXISTS debt_clp integer,
  ADD COLUMN IF NOT EXISTS net_clp  integer;

COMMENT ON COLUMN public.net_worth_snapshots.debt_clp IS
  'Deuda comprometida a futuro (cuotas pendientes + tarjeta por facturar próximo mes) al momento del snapshot. Null en snapshots previos a este fix.';
COMMENT ON COLUMN public.net_worth_snapshots.net_clp IS
  'Patrimonio neto real = total_clp - debt_clp. Null en snapshots previos a este fix (donde solo existe el bruto total_clp).';
