-- ── monthly_insights: enlazar una sugerencia a una categoría concreta ───────
-- Cas: "me gustaria que la sugerencia se pueda ver al momento de cambiar el
-- presupuesto" — hoy "Oportunidades de mejora" (analisis) es la única vista
-- de estas sugerencias; para mostrarlas también en Presupuesto, junto al
-- input de la categoría que corresponde, hace falta saber A QUÉ categoría
-- apunta cada insight y, para los que sugieren un monto (budget_unrealistic,
-- category_over_budget, budget_missing), CUÁL es ese monto — antes solo
-- vivía como texto libre dentro de `description` (ej. "...ajustarlo a
-- $150.000..."), imposible de precargar en un input de forma confiable.
-- Ambas columnas nullable: la mayoría de los tipos de insight (merchant_trend,
-- payday_effect, cash_drag, etc.) no apuntan a una categoría ni a un monto.

ALTER TABLE public.monthly_insights
  ADD COLUMN IF NOT EXISTS category_id      uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_amount integer;

CREATE INDEX IF NOT EXISTS monthly_insights_category_idx
  ON public.monthly_insights(user_id, category_id)
  WHERE category_id IS NOT NULL;
