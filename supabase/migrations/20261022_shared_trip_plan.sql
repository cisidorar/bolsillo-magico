-- ── Compartidos fase 2: planificar el viaje ──────────────────────────────────
-- Presupuesto estimado por categoría (compartido por el grupo), cuántas
-- personas se espera que vayan (antes de invitar) y una meta de ahorro
-- PERSONAL ligada al viaje (cada miembro la suya; solo él la ve, por RLS de
-- savings_goals).

ALTER TABLE public.shared_groups
  ADD COLUMN IF NOT EXISTS budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS planned_people integer CHECK (planned_people IS NULL OR planned_people BETWEEN 1 AND 50);

ALTER TABLE public.shared_group_members
  ADD COLUMN IF NOT EXISTS savings_goal_id uuid REFERENCES public.savings_goals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.shared_group_set_plan(p_group uuid, p_budget jsonb, p_people integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE clean jsonb := '{}'::jsonb; k text; v text;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_people IS NOT NULL AND (p_people < 1 OR p_people > 50) THEN RAISE EXCEPTION 'invalid_people'; END IF;
  IF p_budget IS NOT NULL AND jsonb_typeof(p_budget) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each_text(p_budget) LOOP
      IF k NOT IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros') THEN RAISE EXCEPTION 'invalid_budget'; END IF;
      IF v !~ '^\d{1,12}$' THEN RAISE EXCEPTION 'invalid_budget'; END IF;
      IF v::bigint > 0 THEN clean := clean || jsonb_build_object(k, v::bigint); END IF;
    END LOOP;
  END IF;
  UPDATE public.shared_groups SET budget = clean, planned_people = p_people WHERE id = p_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_set_my_goal(p_group uuid, p_goal uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF p_goal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.savings_goals WHERE id = p_goal AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'invalid_goal';
  END IF;
  UPDATE public.shared_group_members SET savings_goal_id = p_goal WHERE group_id = p_group AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.shared_group_set_plan(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_set_my_goal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_group_set_plan(uuid, jsonb, integer), public.shared_set_my_goal(uuid, uuid) TO authenticated;
