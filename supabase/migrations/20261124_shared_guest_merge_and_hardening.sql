-- 1) Endurecimiento: funciones del módulo de viajes con permisos de más ----------
-- Las funciones nuevas nacen ejecutables por PUBLIC. shared__member_income dejaba a
-- cualquiera (incluso sin sesión) leer el ingreso de cualquier usuario: se cierra.
-- El resto ya validaba auth.uid(), pero no hay motivo para que anon las vea.
REVOKE ALL ON FUNCTION public.shared__member_income(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__on_user_deleted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__token_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared_guest_add(uuid, text, numeric, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_guest_update(uuid, uuid, text, numeric, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_adopt(uuid, uuid, text, text, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_release(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_member_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_guest_add(uuid, text, numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_guest_update(uuid, uuid, text, numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_expense_adopt(uuid, uuid, text, text, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_expense_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_member_names(uuid) TO authenticated;
-- shared_link_view debe seguir siendo pública (enlace de solo lectura); usa shared__token_hash
-- por dentro como SECURITY DEFINER, así que no necesita el permiso.

-- 2) Convertir a la persona sin cuenta en miembro cuando se registra (fase 3) -----
-- Cas la invita por @usuario indicando "es [nombre]". Al aceptar, todo lo que
-- tenía la persona sin cuenta (gastos pagados, partes, pagos) pasa a su cuenta.
ALTER TABLE public.shared_group_members ADD COLUMN IF NOT EXISTS merge_guest_id uuid;

-- Si la persona aún no registra ingresos propios, se sigue usando el promedio que Cas
-- le había puesto; apenas tenga ingresos, manda su propio registro.
CREATE OR REPLACE FUNCTION public.shared__member_income(p_group uuid, p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN m.guest_name IS NOT NULL THEN m.guest_income
              ELSE coalesce(public.shared__income_for(m.user_id), m.guest_income) END
  FROM public.shared_group_members m
  WHERE m.group_id = p_group AND m.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION public.shared__member_income(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.shared_group_invite(uuid, text);
CREATE OR REPLACE FUNCTION public.shared_group_invite(p_group uuid, p_username text, p_guest uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; invitee uuid; cur text; uname text := lower(trim(both '@ ' from coalesce(p_username, '')));
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  SELECT id INTO invitee FROM public.profiles WHERE username = uname AND discoverable;
  IF invitee IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF invitee = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;
  IF p_guest IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_guest
      AND guest_name IS NOT NULL AND status = 'accepted') THEN
    RAISE EXCEPTION 'not_guest';
  END IF;
  SELECT status INTO cur FROM public.shared_group_members WHERE group_id = p_group AND user_id = invitee;
  IF cur = 'accepted' THEN RAISE EXCEPTION 'already_member'; END IF;
  IF cur = 'pending'  THEN RAISE EXCEPTION 'already_invited'; END IF;
  INSERT INTO public.shared_group_members (group_id, user_id, status, invited_by, merge_guest_id)
  VALUES (p_group, invitee, 'pending', auth.uid(), p_guest)
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'pending', invited_by = EXCLUDED.invited_by,
    income_consent = false, joined_at = NULL, merge_guest_id = EXCLUDED.merge_guest_id;
END $$;
REVOKE ALL ON FUNCTION public.shared_group_invite(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_group_invite(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_group_accept(p_group uuid, p_category uuid, p_consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); gm public.shared_group_members; gst public.shared_group_members; e uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;

  SELECT * INTO gm FROM public.shared_group_members WHERE group_id = p_group AND user_id = uid AND status = 'pending' FOR UPDATE;
  IF gm.group_id IS NULL THEN RAISE EXCEPTION 'invite_not_available'; END IF;

  -- La invitación decía "es [persona sin cuenta]": se fusiona su historial con esta cuenta.
  IF gm.merge_guest_id IS NOT NULL THEN
    SELECT * INTO gst FROM public.shared_group_members
     WHERE group_id = p_group AND user_id = gm.merge_guest_id AND guest_name IS NOT NULL AND status = 'accepted';
    IF gst.group_id IS NOT NULL THEN
      UPDATE public.shared_expenses SET paid_by = uid WHERE group_id = p_group AND paid_by = gst.user_id;
      UPDATE public.shared_expense_shares SET user_id = uid WHERE group_id = p_group AND user_id = gst.user_id;
      UPDATE public.shared_settlements SET from_user = uid WHERE group_id = p_group AND from_user = gst.user_id;
      UPDATE public.shared_settlements SET to_user = uid WHERE group_id = p_group AND to_user = gst.user_id;
      DELETE FROM public.shared_group_members WHERE group_id = p_group AND user_id = gst.user_id;
      -- conserva el promedio de Cas como respaldo hasta que tenga ingresos propios
      UPDATE public.shared_group_members SET guest_income = gst.guest_income,
             guest_income_months = gst.guest_income_months, guest_income_set_at = gst.guest_income_set_at
       WHERE group_id = p_group AND user_id = uid;
    END IF;
  END IF;

  UPDATE public.shared_group_members
     SET status = 'accepted', joined_at = now(), personal_category_id = p_category,
         income_consent = coalesce(p_consent, false), merge_guest_id = NULL
   WHERE group_id = p_group AND user_id = uid AND status = 'pending';

  PERFORM public.shared__recalc_group(p_group);
  -- Sus partes y gastos pagados pasan a su cuenta (recalc solo reescribe los 'group'/'equal').
  FOR e IN SELECT id FROM public.shared_expenses WHERE group_id = p_group LOOP
    PERFORM public.shared__sync_personal(e);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.shared_group_accept(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_group_accept(uuid, uuid, boolean) TO authenticated;
