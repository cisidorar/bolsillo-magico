-- ── Compartidos: ficha del ítem del plan (link, código de reserva, notas) ─────
-- Para que el detalle de una reserva sirva de verdad: dónde está la reserva
-- (link), cómo se identifica (código) y lo que conviene recordar (notas).
-- El link solo admite http(s): se abre desde la app, así que nada de otros esquemas.

ALTER TABLE public.shared_plan_items
  ADD COLUMN IF NOT EXISTS link      text CHECK (link IS NULL OR (link ~* '^https?://' AND char_length(link) <= 500)),
  ADD COLUMN IF NOT EXISTS reference text CHECK (reference IS NULL OR char_length(reference) <= 60),
  ADD COLUMN IF NOT EXISTS notes     text CHECK (notes IS NULL OR char_length(notes) <= 500);

DROP FUNCTION IF EXISTS public.shared_plan_item_save(uuid, uuid, text, text, int, date, text, int, int, int, boolean);

CREATE OR REPLACE FUNCTION public.shared_plan_item_save(
  p_id uuid, p_group uuid, p_description text, p_category text, p_amount int, p_due date,
  p_kind text DEFAULT 'reserva', p_qty int DEFAULT 1, p_unit int DEFAULT NULL,
  p_cap int DEFAULT NULL, p_optional boolean DEFAULT false,
  p_link text DEFAULT NULL, p_reference text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; total int; l text; r text; n text;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF coalesce(trim(p_description), '') = '' THEN RAISE EXCEPTION 'description_required'; END IF;
  IF p_category NOT IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros') THEN RAISE EXCEPTION 'invalid_budget'; END IF;
  IF p_kind NOT IN ('reserva', 'durante') THEN RAISE EXCEPTION 'invalid_budget'; END IF;
  IF p_qty IS NULL OR p_qty < 1 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  total := CASE WHEN p_unit IS NOT NULL THEN p_unit * p_qty ELSE p_amount END;
  IF total IS NULL OR total <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  l := nullif(trim(coalesce(p_link, '')), '');
  r := nullif(trim(coalesce(p_reference, '')), '');
  n := nullif(trim(coalesce(p_notes, '')), '');
  IF l IS NOT NULL AND l !~* '^https?://' THEN RAISE EXCEPTION 'invalid_link'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shared_plan_items
      (group_id, description, trip_category, est_amount, due_date, created_by, kind, quantity, unit_amount, cap_amount, optional, link, reference, notes)
    VALUES (p_group, trim(p_description), p_category, total, p_due, auth.uid(), p_kind, p_qty, p_unit, p_cap, coalesce(p_optional, false), l, r, n)
    RETURNING id INTO rid;
  ELSE
    UPDATE public.shared_plan_items SET description = trim(p_description), trip_category = p_category,
      est_amount = total, due_date = p_due, kind = p_kind, quantity = p_qty, unit_amount = p_unit,
      cap_amount = p_cap, optional = coalesce(p_optional, false), link = l, reference = r, notes = n
    WHERE id = p_id AND group_id = p_group AND paid_at IS NULL RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  END IF;
  RETURN rid;
END;
$$;

REVOKE ALL ON FUNCTION public.shared_plan_item_save(uuid, uuid, text, text, int, date, text, int, int, int, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_plan_item_save(uuid, uuid, text, text, int, date, text, int, int, int, boolean, text, text, text) TO authenticated;
