-- Eliminar un viaje compartido (nov 2026): "se planificó y al final no va".
--
-- Solo quien lo creó. Todo lo que cuelga del viaje (plan, gastos, partes, transferencias,
-- miembros, invitaciones, enlaces) se borra por ON DELETE CASCADE, y los gastos propios de
-- cada miembro (expenses.shared_expense_id) también. Por eso hay un freno: si otra persona
-- CON CUENTA ya aceptó y el viaje tiene gastos o transferencias, borrarlo le borraría su
-- historial; en ese caso hay que cerrarlo (archivarlo), no eliminarlo.
CREATE OR REPLACE FUNCTION public.shared_group_delete(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND created_by = uid) THEN
    RAISE EXCEPTION 'only_creator';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.shared_group_members
        WHERE group_id = p_group AND status = 'accepted' AND guest_name IS NULL AND user_id <> uid
     )
     AND (
       EXISTS (SELECT 1 FROM public.shared_expenses WHERE group_id = p_group)
       OR EXISTS (SELECT 1 FROM public.shared_settlements WHERE group_id = p_group)
     ) THEN
    RAISE EXCEPTION 'group_has_activity';
  END IF;

  DELETE FROM public.shared_groups WHERE id = p_group;
END;
$$;

REVOKE ALL ON FUNCTION public.shared_group_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_group_delete(uuid) TO authenticated;
