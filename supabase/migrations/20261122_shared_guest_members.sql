-- Viaje con invitada/o sin cuenta (nov 2026, docs/PLAN_VIAJE_CON_INVITADA.md, fase 1).
--
-- Un participante sin cuenta es una fila de shared_group_members con un uuid
-- generado en user_id (no existe en auth.users) y guest_name. Su ingreso es solo
-- un promedio mensual (guest_income) calculado en la app con sus últimos sueldos
-- líquidos; no se guardan los sueldos sueltos. Todo lo demás (partes, deudas,
-- pagos) funciona igual porque se indexa por user_id.
-- Además: el promedio de ingreso de un usuario con cuenta pasa de 3 a 6 meses
-- y se pueden pasar gastos existentes a un viaje (y sacarlos).

-- 1. Sin FK a auth.users donde puede aparecer un invitado -----------------------
ALTER TABLE public.shared_group_members     DROP CONSTRAINT IF EXISTS shared_group_members_user_id_fkey;
ALTER TABLE public.shared_expense_shares    DROP CONSTRAINT IF EXISTS shared_expense_shares_user_id_fkey;
ALTER TABLE public.shared_expenses          DROP CONSTRAINT IF EXISTS shared_expenses_paid_by_fkey;
ALTER TABLE public.shared_settlements       DROP CONSTRAINT IF EXISTS shared_settlements_from_user_fkey;
ALTER TABLE public.shared_settlements       DROP CONSTRAINT IF EXISTS shared_settlements_to_user_fkey;

ALTER TABLE public.shared_group_members
  ADD COLUMN IF NOT EXISTS guest_name          text,
  ADD COLUMN IF NOT EXISTS guest_income        numeric,
  ADD COLUMN IF NOT EXISTS guest_income_months int,
  ADD COLUMN IF NOT EXISTS guest_income_set_at timestamptz;

ALTER TABLE public.shared_group_members
  DROP CONSTRAINT IF EXISTS shared_guest_fields_chk;
ALTER TABLE public.shared_group_members
  ADD CONSTRAINT shared_guest_fields_chk CHECK (
    guest_name IS NULL
    OR (char_length(trim(guest_name)) BETWEEN 1 AND 40 AND guest_income IS NOT NULL AND guest_income > 0)
  );

-- Al borrar una cuenta, se limpian sus filas (antes lo hacía el ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.shared__on_user_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM public.shared_settlements WHERE from_user = OLD.id OR to_user = OLD.id;
  DELETE FROM public.shared_expenses WHERE paid_by = OLD.id;
  DELETE FROM public.shared_expense_shares WHERE user_id = OLD.id;
  DELETE FROM public.shared_group_members WHERE user_id = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_shared_user_deleted ON auth.users;
CREATE TRIGGER trg_shared_user_deleted BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.shared__on_user_deleted();

-- 2. Ingresos: 6 meses, y el invitado usa su promedio guardado ------------------
CREATE OR REPLACE FUNCTION public.shared__income_for(p_user uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v numeric;
  ym int := extract(year  FROM (now() AT TIME ZONE 'America/Santiago'))::int * 12
          + extract(month FROM (now() AT TIME ZONE 'America/Santiago'))::int;
BEGIN
  SELECT avg(t.amount) INTO v FROM (
    SELECT amount FROM public.incomes
    WHERE user_id = p_user AND amount > 0 AND (year * 12 + month) < ym
    ORDER BY year DESC, month DESC LIMIT 6
  ) t;
  IF v IS NULL THEN
    SELECT amount INTO v FROM public.incomes
    WHERE user_id = p_user AND amount > 0 ORDER BY year DESC, month DESC LIMIT 1;
  END IF;
  IF v IS NULL THEN
    SELECT liquido INTO v FROM public.payslips
    WHERE user_id = p_user AND liquido > 0 ORDER BY year DESC, month DESC LIMIT 1;
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.shared__member_income(p_group uuid, p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN m.guest_name IS NOT NULL THEN m.guest_income
              ELSE public.shared__income_for(m.user_id) END
  FROM public.shared_group_members m
  WHERE m.group_id = p_group AND m.user_id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.shared__member_weights(p_group uuid)
RETURNS TABLE(user_id uuid, w bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; n int; total numeric; missing int;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  SELECT count(*) INTO n FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted';
  IF g.split_mode = 'equal' OR n <= 1 THEN
    RETURN QUERY SELECT m.user_id, 1::bigint FROM public.shared_group_members m
      WHERE m.group_id = p_group AND m.status = 'accepted';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.shared_group_members m
             WHERE m.group_id = p_group AND m.status = 'accepted' AND NOT m.income_consent) THEN
    RAISE EXCEPTION 'no_income_data';
  END IF;

  SELECT count(*) INTO missing
  FROM public.shared_group_members m
  WHERE m.group_id = p_group AND m.status = 'accepted'
    AND public.shared__member_income(p_group, m.user_id) IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'no_income_data'; END IF;

  SELECT sum(public.shared__member_income(p_group, m.user_id)) INTO total
  FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted';
  IF total IS NULL OR total <= 0 THEN RAISE EXCEPTION 'no_income_data'; END IF;

  RETURN QUERY
    SELECT m.user_id,
           GREATEST(1, round(public.shared__member_income(p_group, m.user_id) * 1000000 / total))::bigint
    FROM public.shared_group_members m
    WHERE m.group_id = p_group AND m.status = 'accepted';
END $$;

-- 3. Gastos personales: los invitados no tienen cuenta donde crearlos ------------
CREATE OR REPLACE FUNCTION public.shared__sync_personal(p_expense uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.shared_expenses; uid uuid; sh int; cat uuid; pm uuid; extra int;
BEGIN
  SELECT * INTO e FROM public.shared_expenses WHERE id = p_expense;
  IF e.id IS NULL THEN RETURN; END IF;

  DELETE FROM public.expenses x
   WHERE x.shared_expense_id = e.id
     AND x.user_id <> e.paid_by
     AND x.user_id NOT IN (SELECT s.user_id FROM public.shared_expense_shares s WHERE s.expense_id = e.id AND s.share > 0);

  FOR uid IN
    SELECT s.user_id FROM public.shared_expense_shares s WHERE s.expense_id = e.id AND s.share > 0
    UNION SELECT e.paid_by
  LOOP
    IF EXISTS (SELECT 1 FROM public.shared_group_members m
               WHERE m.group_id = e.group_id AND m.user_id = uid AND m.guest_name IS NOT NULL) THEN
      CONTINUE;
    END IF;
    sh := coalesce((SELECT s.share FROM public.shared_expense_shares s WHERE s.expense_id = e.id AND s.user_id = uid), 0);
    pm := CASE WHEN uid = e.paid_by THEN e.payment_method_id ELSE NULL END;
    IF sh = 0 AND pm IS NULL THEN
      DELETE FROM public.expenses WHERE user_id = uid AND shared_expense_id = e.id;
      CONTINUE;
    END IF;
    extra := CASE WHEN uid = e.paid_by AND pm IS NOT NULL THEN e.amount - sh ELSE 0 END;
    SELECT m.personal_category_id INTO cat FROM public.shared_group_members m
      WHERE m.group_id = e.group_id AND m.user_id = uid;
    INSERT INTO public.expenses
      (user_id, amount, category_id, payment_method_id, description, date,
       shared_expense_id, card_extra, excluded_from_analysis)
    VALUES (uid, sh, cat, pm, e.description, e.date, e.id, extra, true)
    ON CONFLICT (user_id, shared_expense_id) DO UPDATE SET
      amount = EXCLUDED.amount,
      payment_method_id = EXCLUDED.payment_method_id,
      description = EXCLUDED.description,
      date = EXCLUDED.date,
      card_extra = EXCLUDED.card_extra,
      excluded_from_analysis = true,
      category_id = coalesce(public.expenses.category_id, EXCLUDED.category_id);
  END LOOP;
END $$;

-- 4. Nombres: los invitados salen con su nombre ----------------------------------
DROP FUNCTION IF EXISTS public.shared_member_names(uuid);
CREATE FUNCTION public.shared_member_names(p_group uuid)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, status text,
              income_consent boolean, is_creator boolean, is_guest boolean, guest_income numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.user_id,
         CASE WHEN m.guest_name IS NOT NULL THEN m.guest_name
              ELSE coalesce(nullif(trim(p.display_name), ''), '@' || p.username) END,
         p.username, p.avatar_url, m.status, m.income_consent, (m.user_id = g.created_by),
         (m.guest_name IS NOT NULL),
         CASE WHEN m.guest_name IS NOT NULL THEN m.guest_income END
  FROM public.shared_group_members m
  JOIN public.shared_groups g ON g.id = m.group_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group AND m.status IN ('accepted', 'pending')
    AND public.shared_is_member(p_group);
$$;

-- 5. Agregar / actualizar invitado ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.shared_guest_add(p_group uuid, p_name text, p_income numeric, p_months int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; gid uuid := gen_random_uuid(); nm text := trim(coalesce(p_name, ''));
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF nm = '' OR char_length(nm) > 40 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_income IS NULL OR p_income <= 0 THEN RAISE EXCEPTION 'invalid_income'; END IF;
  IF (SELECT count(*) FROM public.shared_group_members WHERE group_id = p_group AND guest_name IS NOT NULL) >= 8 THEN
    RAISE EXCEPTION 'too_many_guests';
  END IF;
  INSERT INTO public.shared_group_members
    (group_id, user_id, status, income_consent, invited_by, joined_at,
     guest_name, guest_income, guest_income_months, guest_income_set_at)
  VALUES (p_group, gid, 'accepted', true, auth.uid(), now(),
          nm, round(p_income), LEAST(GREATEST(coalesce(p_months, 1), 1), 12), now());
  PERFORM public.shared__recalc_group(p_group);
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.shared_guest_update(p_group uuid, p_user uuid, p_name text, p_income numeric, p_months int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; nm text := trim(coalesce(p_name, ''));
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF nm = '' OR char_length(nm) > 40 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_income IS NULL OR p_income <= 0 THEN RAISE EXCEPTION 'invalid_income'; END IF;
  UPDATE public.shared_group_members SET
    guest_name = nm, guest_income = round(p_income),
    guest_income_months = LEAST(GREATEST(coalesce(p_months, 1), 1), 12), guest_income_set_at = now()
  WHERE group_id = p_group AND user_id = p_user AND guest_name IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_guest'; END IF;
  PERFORM public.shared__recalc_group(p_group);
END $$;

-- 6. Pasar un gasto propio (ya registrado) a un viaje, y sacarlo -----------------------
-- Solo el pagador puede hacerlo con su propio gasto. El mismo registro de expenses
-- queda enlazado (shared_expense_id) y pasa a guardar solo su parte, igual que los
-- gastos creados desde el viaje.
CREATE OR REPLACE FUNCTION public.shared_expense_adopt(
  p_group uuid, p_expense uuid, p_trip_category text, p_split_kind text, p_participants uuid[], p_exact jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); g public.shared_groups; x public.expenses; e public.shared_expenses;
        every boolean := (p_participants IS NULL); parts uuid[]; total int;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_split_kind NOT IN ('group', 'equal', 'exact') THEN RAISE EXCEPTION 'invalid_split_kind'; END IF;
  IF p_split_kind = 'exact' THEN every := false; END IF;
  IF p_split_kind = 'group' AND g.split_error IS NOT NULL THEN RAISE EXCEPTION 'no_income_data'; END IF;

  SELECT * INTO x FROM public.expenses WHERE id = p_expense AND user_id = uid FOR UPDATE;
  IF x.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF x.shared_expense_id IS NOT NULL OR x.recurring_expense_id IS NOT NULL THEN RAISE EXCEPTION 'expense_not_adoptable'; END IF;
  IF x.amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  IF every THEN
    parts := ARRAY(SELECT m.user_id FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted');
  ELSE
    parts := p_participants;
  END IF;

  INSERT INTO public.shared_expenses
    (group_id, trip_category, description, date, amount, paid_by, payment_method_id, split_kind, everyone, created_by)
  VALUES (p_group, coalesce(p_trip_category, 'otros'), x.description, x.date, x.amount, uid, x.payment_method_id, p_split_kind, every, uid)
  RETURNING * INTO e;

  -- se enlaza antes de sincronizar para que sync_personal actualice este mismo registro
  UPDATE public.expenses SET shared_expense_id = e.id WHERE id = x.id;

  PERFORM public.shared__write_shares(e.id, p_group, x.amount, uid, p_split_kind, parts, p_exact);
  PERFORM public.shared__sync_personal(e.id);
  RETURN e.id;
END $$;

CREATE OR REPLACE FUNCTION public.shared_expense_release(p_shared_expense uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); e public.shared_expenses; g public.shared_groups;
BEGIN
  SELECT * INTO e FROM public.shared_expenses WHERE id = p_shared_expense;
  IF e.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF e.paid_by <> uid THEN RAISE EXCEPTION 'only_payer'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = e.group_id;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  -- el gasto del pagador vuelve a ser un gasto normal por el total
  UPDATE public.expenses SET
    amount = e.amount, card_extra = 0, shared_expense_id = NULL, excluded_from_analysis = false
  WHERE user_id = uid AND shared_expense_id = e.id;
  DELETE FROM public.shared_expenses WHERE id = e.id;  -- borra partes y gastos de los demás
END $$;

GRANT EXECUTE ON FUNCTION public.shared_guest_add(uuid, text, numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_guest_update(uuid, uuid, text, numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_expense_adopt(uuid, uuid, text, text, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_expense_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_member_names(uuid) TO authenticated;
