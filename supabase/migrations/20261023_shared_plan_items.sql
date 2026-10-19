-- ── Compartidos fase 3: pagos programados del viaje ─────────────────────────
-- "Saldo del alojamiento el 20 de noviembre": un pago futuro conocido. Aparece
-- en el flujo de caja de 30 días de quienes participan y, al pagarlo, se
-- convierte en un gasto compartido normal (shared_expense_save).

CREATE TABLE IF NOT EXISTS public.shared_plan_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  description       text NOT NULL,
  trip_category     text NOT NULL DEFAULT 'otros'
                    CHECK (trip_category IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros')),
  est_amount        integer NOT NULL CHECK (est_amount > 0),
  due_date          date,
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_expense_id uuid REFERENCES public.shared_expenses(id) ON DELETE SET NULL,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_plan_items_group_idx ON public.shared_plan_items(group_id);

ALTER TABLE public.shared_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read plan items" ON public.shared_plan_items;
CREATE POLICY "members read plan items" ON public.shared_plan_items
  FOR SELECT USING (public.shared_is_member(group_id));
GRANT SELECT ON public.shared_plan_items TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_plan_item_save(
  p_id uuid, p_group uuid, p_description text, p_category text, p_amount int, p_due date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(trim(p_description), '') = '' THEN RAISE EXCEPTION 'description_required'; END IF;
  IF p_category NOT IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros') THEN RAISE EXCEPTION 'invalid_budget'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.shared_plan_items (group_id, description, trip_category, est_amount, due_date, created_by)
    VALUES (p_group, trim(p_description), p_category, p_amount, p_due, auth.uid()) RETURNING id INTO rid;
  ELSE
    UPDATE public.shared_plan_items SET description = trim(p_description), trip_category = p_category,
      est_amount = p_amount, due_date = p_due
    WHERE id = p_id AND group_id = p_group AND paid_at IS NULL RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  END IF;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_plan_item_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid;
BEGIN
  SELECT group_id INTO g FROM public.shared_plan_items WHERE id = p_id;
  IF g IS NULL OR NOT public.shared_is_member(g) THEN RAISE EXCEPTION 'not_member'; END IF;
  DELETE FROM public.shared_plan_items WHERE id = p_id AND paid_at IS NULL;
END;
$$;

-- Pagar: crea el gasto compartido (todos los miembros, modo del grupo) y lo enlaza.
CREATE OR REPLACE FUNCTION public.shared_plan_item_pay(
  p_id uuid, p_amount int, p_date date, p_payment_method uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.shared_plan_items; g public.shared_groups; eid uuid; kind text;
BEGIN
  SELECT * INTO it FROM public.shared_plan_items WHERE id = p_id FOR UPDATE;
  IF it.id IS NULL OR NOT public.shared_is_member(it.group_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF it.paid_at IS NOT NULL THEN RAISE EXCEPTION 'already_paid'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = it.group_id;
  kind := CASE WHEN g.split_mode = 'income' AND g.split_error IS NULL THEN 'group' ELSE 'equal' END;
  eid := public.shared_expense_save(NULL, it.group_id, it.trip_category, it.description,
           coalesce(p_date, current_date), coalesce(p_amount, it.est_amount), auth.uid(),
           p_payment_method, kind, NULL, NULL);
  UPDATE public.shared_plan_items SET shared_expense_id = eid, paid_at = now() WHERE id = p_id;
  RETURN eid;
END;
$$;

REVOKE ALL ON FUNCTION public.shared_plan_item_save(uuid, uuid, text, text, int, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_plan_item_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_plan_item_pay(uuid, int, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_plan_item_save(uuid, uuid, text, text, int, date),
  public.shared_plan_item_delete(uuid), public.shared_plan_item_pay(uuid, int, date, uuid) TO authenticated;
