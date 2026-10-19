-- ── Gastos compartidos, fase 1 (docs/PLAN_GASTOS_COMPARTIDOS.md, oct 2026) ──
-- Dos personas de la app planean un viaje y dividen sus gastos según sueldo.
--
-- Reglas que esta migración hace cumplir (no la UI):
--   D1  El sueldo del otro nunca se lee: el % lo calcula una función
--       SECURITY DEFINER que devuelve solo la proporción, y solo cuando ambos
--       dieron su consentimiento.
--   D2  El % se acuerda UNA vez por viaje: uno propone (pending_*), el otro
--       confirma. Mientras no esté acordado no se pueden registrar gastos.
--   D3  Cada gasto crea en `expenses` de cada uno SOLO su parte
--       (shared_expense_id). El pagador además guarda card_extra = lo que el
--       banco le cobra de más (la parte del otro) para cuadrar su estado de
--       cuenta (D4).
--   D5  Esas filas nacen con excluded_from_analysis = true.
--
-- Todo lo que escribe datos de dos personas pasa por funciones
-- SECURITY DEFINER; las tablas solo tienen políticas de lectura. Así un
-- usuario nunca puede tocar directo ni el % ni las filas del otro.

-- ── Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shared_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  -- 'event' = viaje (esta fase) · 'household' = vivir juntos (fase futura).
  kind             text NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'household')),
  start_date       date,
  end_date         date,
  member_a         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- quien crea
  member_b         uuid REFERENCES auth.users(id) ON DELETE CASCADE,            -- null hasta aceptar
  -- Reparto VIGENTE (acordado por ambos). ratio_a = parte del miembro A, 0..1.
  split_mode       text CHECK (split_mode IN ('income', 'equal', 'fixed')),
  ratio_a          numeric(5,4) CHECK (ratio_a BETWEEN 0 AND 1),
  ratio_agreed_at  timestamptz,
  -- Propuesta pendiente: quien la hizo no puede confirmarla.
  pending_mode     text CHECK (pending_mode IN ('income', 'equal', 'fixed')),
  pending_ratio_a  numeric(5,4) CHECK (pending_ratio_a BETWEEN 0 AND 1),  -- null si es 'income' (se calcula al confirmar)
  pending_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_group_members (
  group_id             uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  invited_email        text NOT NULL,
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  income_consent       boolean NOT NULL DEFAULT false,
  personal_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  joined_at            timestamptz,
  PRIMARY KEY (group_id, invited_email)
);
CREATE INDEX IF NOT EXISTS shared_group_members_user_idx ON public.shared_group_members(user_id);

CREATE TABLE IF NOT EXISTS public.shared_expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  trip_category     text NOT NULL DEFAULT 'otros'
                    CHECK (trip_category IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros')),
  description       text NOT NULL,
  date              date NOT NULL,
  amount            integer NOT NULL CHECK (amount > 0),          -- CLP, cargo completo
  paid_by           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,  -- de quien pagó
  -- 'group' = usa el % acordado del viaje y se recalcula si cambia.
  split_kind        text NOT NULL DEFAULT 'group' CHECK (split_kind IN ('group', 'equal', 'only_a', 'only_b', 'exact')),
  share_a           integer NOT NULL CHECK (share_a >= 0),
  share_b           integer NOT NULL CHECK (share_b >= 0),
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (share_a + share_b = amount)
);
CREATE INDEX IF NOT EXISTS shared_expenses_group_idx ON public.shared_expenses(group_id, date DESC);

CREATE TABLE IF NOT EXISTS public.shared_settlements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  from_user  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     integer NOT NULL CHECK (amount > 0),
  date       date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS shared_settlements_group_idx ON public.shared_settlements(group_id);

-- ── Enlace con los gastos personales ────────────────────────────────────────
-- Índice único NO parcial (lección de 20261005: ON CONFLICT no infiere índices
-- parciales). Los NULL nunca chocan entre sí, así que los gastos normales no
-- se ven afectados.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS shared_expense_id uuid REFERENCES public.shared_expenses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS card_extra integer NOT NULL DEFAULT 0 CHECK (card_extra >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_shared_once_per_user_idx
  ON public.expenses(user_id, shared_expense_id);

COMMENT ON COLUMN public.expenses.card_extra IS
  'D4: lo que el banco le cobra al pagador de más que su propia parte (la parte de la otra persona en un gasto compartido). Los estados de cuenta suman amount + card_extra; todo lo demás suma solo amount.';

-- ── Funciones auxiliares (internas, sin acceso directo) ─────────────────────

CREATE OR REPLACE FUNCTION public.shared_is_member(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_group_members m
    WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.shared_is_invited(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_group_members m
    WHERE m.group_id = p_group AND m.status = 'pending'
      AND lower(m.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Ingreso representativo de una persona: promedio de los últimos 3 meses
-- registrados ANTES del mes en curso (el sueldo de mayo financia junio); si
-- no hay, el último ingreso registrado; si tampoco, el líquido de la última
-- liquidación. Null si no hay nada: nunca se adivina.
CREATE OR REPLACE FUNCTION public.shared__income_for(p_user uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v numeric;
  ym int := extract(year  FROM (now() AT TIME ZONE 'America/Santiago'))::int * 12
          + extract(month FROM (now() AT TIME ZONE 'America/Santiago'))::int;
BEGIN
  SELECT avg(t.amount) INTO v FROM (
    SELECT amount FROM public.incomes
    WHERE user_id = p_user AND amount > 0 AND (year * 12 + month) < ym
    ORDER BY year DESC, month DESC LIMIT 3
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
END;
$$;

-- Proporción del miembro A según ingresos, o null si a alguno le faltan datos.
-- Devuelve SOLO el cociente: los montos no salen de esta función.
CREATE OR REPLACE FUNCTION public.shared__income_ratio(p_group uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; ia numeric; ib numeric;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.member_a IS NULL OR g.member_b IS NULL THEN RETURN NULL; END IF;
  ia := public.shared__income_for(g.member_a);
  ib := public.shared__income_for(g.member_b);
  IF ia IS NULL OR ib IS NULL OR ia + ib <= 0 THEN RETURN NULL; END IF;
  RETURN round(ia / (ia + ib), 4);
END;
$$;

-- Reparto de un monto. El peso que sobra del redondeo queda con quien pagó.
-- Debe dar exactamente lo mismo que splitAmount() en lib/shared-split.ts.
CREATE OR REPLACE FUNCTION public.shared__shares(
  g public.shared_groups, p_amount int, p_paid_by uuid, p_kind text, p_exact_a int
) RETURNS int[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE r numeric; sa int; sb int;
BEGIN
  IF p_kind = 'only_a' THEN RETURN ARRAY[p_amount, 0]; END IF;
  IF p_kind = 'only_b' THEN RETURN ARRAY[0, p_amount]; END IF;
  IF p_kind = 'exact' THEN
    IF p_exact_a IS NULL OR p_exact_a < 0 OR p_exact_a > p_amount THEN
      RAISE EXCEPTION 'invalid_exact_share';
    END IF;
    RETURN ARRAY[p_exact_a, p_amount - p_exact_a];
  END IF;
  r := CASE WHEN p_kind = 'equal' THEN 0.5 ELSE g.ratio_a END;
  IF r IS NULL THEN RAISE EXCEPTION 'ratio_not_agreed'; END IF;
  IF p_paid_by = g.member_a THEN
    sb := round(p_amount * (1 - r))::int;  sa := p_amount - sb;
  ELSE
    sa := round(p_amount * r)::int;        sb := p_amount - sa;
  END IF;
  RETURN ARRAY[sa, sb];
END;
$$;

-- Escribe/actualiza (o borra, si la parte es 0) la fila personal de cada uno.
CREATE OR REPLACE FUNCTION public.shared__sync_personal(e public.shared_expenses)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; uid uuid; sh int; cat uuid; pm uuid; extra int;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = e.group_id;
  FOREACH uid IN ARRAY ARRAY[g.member_a, g.member_b] LOOP
    sh := CASE WHEN uid = g.member_a THEN e.share_a ELSE e.share_b END;
    IF sh <= 0 THEN
      DELETE FROM public.expenses WHERE user_id = uid AND shared_expense_id = e.id;
      CONTINUE;
    END IF;
    SELECT personal_category_id INTO cat FROM public.shared_group_members
      WHERE group_id = g.id AND user_id = uid;
    pm    := CASE WHEN uid = e.paid_by THEN e.payment_method_id ELSE NULL END;
    extra := CASE WHEN uid = e.paid_by AND pm IS NOT NULL THEN e.amount - sh ELSE 0 END;
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
      category_id = coalesce(public.expenses.category_id, EXCLUDED.category_id);
  END LOOP;
END;
$$;

-- Recalcula los gastos que siguen el % del viaje (cuando el % cambia).
CREATE OR REPLACE FUNCTION public.shared__recalc_group(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; e public.shared_expenses; s int[];
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  FOR e IN SELECT * FROM public.shared_expenses WHERE group_id = p_group AND split_kind = 'group' LOOP
    s := public.shared__shares(g, e.amount, e.paid_by, 'group', NULL);
    UPDATE public.shared_expenses SET share_a = s[1], share_b = s[2], updated_at = now()
      WHERE id = e.id RETURNING * INTO e;
    PERFORM public.shared__sync_personal(e);
  END LOOP;
END;
$$;

-- ── API (lo único que llama la app) ─────────────────────────────────────────

-- Crear un viaje e invitar a la otra persona. La propuesta de reparto queda
-- pendiente hasta que la otra persona acepta (aceptar = confirmar).
CREATE OR REPLACE FUNCTION public.shared_group_create(
  p_name text, p_start date, p_end date,
  p_split_mode text, p_fixed_ratio numeric,
  p_email text, p_category uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); my_email text := lower(coalesce(auth.jwt() ->> 'email', '')); gid uuid; em text := lower(trim(p_email));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF em = '' OR em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF em = my_email THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;
  IF p_split_mode NOT IN ('income', 'equal', 'fixed') THEN RAISE EXCEPTION 'invalid_split_mode'; END IF;
  IF p_split_mode = 'fixed' AND (p_fixed_ratio IS NULL OR p_fixed_ratio < 0 OR p_fixed_ratio > 1) THEN
    RAISE EXCEPTION 'invalid_ratio';
  END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  INSERT INTO public.shared_groups
    (name, kind, start_date, end_date, member_a, pending_mode, pending_ratio_a, pending_by)
  VALUES
    (trim(p_name), 'event', p_start, p_end, uid, p_split_mode,
     CASE p_split_mode WHEN 'equal' THEN 0.5 WHEN 'fixed' THEN round(p_fixed_ratio, 4) ELSE NULL END, uid)
  RETURNING id INTO gid;

  INSERT INTO public.shared_group_members (group_id, invited_email, user_id, status, income_consent, personal_category_id, joined_at)
  VALUES (gid, my_email, uid, 'accepted', p_split_mode = 'income', p_category, now());
  INSERT INTO public.shared_group_members (group_id, invited_email, status)
  VALUES (gid, em, 'pending');
  RETURN gid;
END;
$$;

-- Promueve la propuesta pendiente a reparto vigente. Interna: la llaman
-- aceptar invitación y confirmar propuesta. p_actor = quien confirma.
CREATE OR REPLACE FUNCTION public.shared__promote(p_group uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; r numeric; had_ratio boolean;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.pending_mode IS NULL THEN RETURN; END IF;
  had_ratio := g.ratio_agreed_at IS NOT NULL;
  IF g.pending_mode = 'income' THEN
    -- Confirmar un reparto "según ingresos" es dar el consentimiento (D1).
    UPDATE public.shared_group_members SET income_consent = true
      WHERE group_id = p_group AND user_id IN (g.pending_by, p_actor);
    r := public.shared__income_ratio(p_group);
    IF r IS NULL THEN RAISE EXCEPTION 'no_income_data'; END IF;
  ELSE
    r := g.pending_ratio_a;
  END IF;
  UPDATE public.shared_groups SET
    split_mode = g.pending_mode, ratio_a = r, ratio_agreed_at = now(),
    pending_mode = NULL, pending_ratio_a = NULL, pending_by = NULL
  WHERE id = p_group;
  IF had_ratio THEN PERFORM public.shared__recalc_group(p_group); END IF;
END;
$$;

-- Aceptar la invitación. Aceptar confirma la propuesta de reparto; si era
-- "según ingresos" y a alguno le faltan datos, el viaje queda creado pero sin
-- reparto acordado (cualquiera puede proponer 50/50 o un % fijo).
CREATE OR REPLACE FUNCTION public.shared_group_accept(p_group uuid, p_category uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); g public.shared_groups;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.id IS NULL OR g.member_b IS NOT NULL THEN RAISE EXCEPTION 'invite_not_available'; END IF;
  UPDATE public.shared_group_members
     SET user_id = uid, status = 'accepted', joined_at = now(), personal_category_id = p_category
   WHERE group_id = p_group AND lower(invited_email) = em AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_available'; END IF;
  UPDATE public.shared_groups SET member_b = uid WHERE id = p_group;
  BEGIN
    PERFORM public.shared__promote(p_group, uid);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_income_data' THEN RAISE; END IF;
    UPDATE public.shared_groups SET pending_mode = NULL, pending_ratio_a = NULL, pending_by = NULL WHERE id = p_group;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_group_decline(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.shared_group_members SET status = 'declined'
   WHERE group_id = p_group AND status = 'pending'
     AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
END;
$$;

-- Proponer (o cambiar) el reparto. El otro tiene que confirmarlo.
CREATE OR REPLACE FUNCTION public.shared_ratio_propose(p_group uuid, p_mode text, p_fixed_ratio numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF g.member_b IS NULL THEN RAISE EXCEPTION 'waiting_for_member'; END IF;
  IF p_mode NOT IN ('income', 'equal', 'fixed') THEN RAISE EXCEPTION 'invalid_split_mode'; END IF;
  IF p_mode = 'fixed' AND (p_fixed_ratio IS NULL OR p_fixed_ratio < 0 OR p_fixed_ratio > 1) THEN
    RAISE EXCEPTION 'invalid_ratio';
  END IF;
  UPDATE public.shared_groups SET
    pending_mode = p_mode,
    pending_ratio_a = CASE p_mode WHEN 'equal' THEN 0.5 WHEN 'fixed' THEN round(p_fixed_ratio, 4) ELSE NULL END,
    pending_by = auth.uid()
  WHERE id = p_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_ratio_confirm(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF g.pending_mode IS NULL THEN RAISE EXCEPTION 'nothing_to_confirm'; END IF;
  IF g.pending_by = auth.uid() THEN RAISE EXCEPTION 'cannot_confirm_own_proposal'; END IF;
  PERFORM public.shared__promote(p_group, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_ratio_reject(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  UPDATE public.shared_groups SET pending_mode = NULL, pending_ratio_a = NULL, pending_by = NULL WHERE id = p_group;
END;
$$;

-- Crear o editar un gasto del viaje y reflejar la parte de cada uno.
CREATE OR REPLACE FUNCTION public.shared_expense_save(
  p_id uuid, p_group uuid, p_trip_category text, p_description text, p_date date,
  p_amount int, p_paid_by uuid, p_payment_method uuid, p_split_kind text, p_exact_a int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g public.shared_groups; s int[]; e public.shared_expenses; old public.shared_expenses; pm uuid := p_payment_method;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF g.member_b IS NULL THEN RAISE EXCEPTION 'waiting_for_member'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(trim(p_description), '') = '' THEN RAISE EXCEPTION 'description_required'; END IF;
  IF p_paid_by NOT IN (g.member_a, g.member_b) THEN RAISE EXCEPTION 'invalid_payer'; END IF;
  IF p_split_kind NOT IN ('group', 'equal', 'only_a', 'only_b', 'exact') THEN RAISE EXCEPTION 'invalid_split_kind'; END IF;
  IF p_split_kind = 'group' AND g.ratio_agreed_at IS NULL THEN RAISE EXCEPTION 'ratio_not_agreed'; END IF;

  -- El método de pago es de quien pagó: solo se acepta si pagó quien guarda.
  IF p_id IS NOT NULL THEN
    SELECT * INTO old FROM public.shared_expenses WHERE id = p_id AND group_id = p_group;
    IF old.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
    IF old.paid_by = p_paid_by AND uid <> p_paid_by THEN pm := old.payment_method_id; END IF;
  END IF;
  IF pm IS NOT NULL THEN
    IF uid <> p_paid_by AND NOT (p_id IS NOT NULL AND pm = old.payment_method_id) THEN pm := NULL; END IF;
    IF pm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = pm AND user_id = p_paid_by) THEN
      RAISE EXCEPTION 'invalid_payment_method';
    END IF;
  END IF;

  s := public.shared__shares(g, p_amount, p_paid_by, p_split_kind, p_exact_a);

  IF p_id IS NULL THEN
    INSERT INTO public.shared_expenses
      (group_id, trip_category, description, date, amount, paid_by, payment_method_id, split_kind, share_a, share_b, created_by)
    VALUES (p_group, p_trip_category, trim(p_description), p_date, p_amount, p_paid_by, pm, p_split_kind, s[1], s[2], uid)
    RETURNING * INTO e;
  ELSE
    UPDATE public.shared_expenses SET
      trip_category = p_trip_category, description = trim(p_description), date = p_date, amount = p_amount,
      paid_by = p_paid_by, payment_method_id = pm, split_kind = p_split_kind,
      share_a = s[1], share_b = s[2], updated_by = uid, updated_at = now()
    WHERE id = p_id RETURNING * INTO e;
  END IF;

  PERFORM public.shared__sync_personal(e);
  RETURN e.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_expense_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.shared_expenses; g public.shared_groups;
BEGIN
  SELECT * INTO e FROM public.shared_expenses WHERE id = p_id;
  IF e.id IS NULL OR NOT public.shared_is_member(e.group_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = e.group_id;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  DELETE FROM public.shared_expenses WHERE id = p_id;  -- las filas personales caen por ON DELETE CASCADE
END;
$$;

-- Saldar: cualquiera de los dos registra que hubo una transferencia entre
-- ellos (quien debe la hizo, o quien recibió la confirma). No crea gastos ni
-- ingresos: la plata ya se contó una vez cuando ocurrió el gasto.
CREATE OR REPLACE FUNCTION public.shared_settle(p_group uuid, p_from uuid, p_to uuid, p_amount int, p_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; sid uuid;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_from = p_to OR p_from NOT IN (g.member_a, g.member_b) OR p_to NOT IN (g.member_a, g.member_b) THEN
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  INSERT INTO public.shared_settlements (group_id, from_user, to_user, amount, date)
  VALUES (p_group, p_from, p_to, p_amount, p_date) RETURNING id INTO sid;
  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_settlement_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.shared_settlements; closed timestamptz;
BEGIN
  SELECT * INTO s FROM public.shared_settlements WHERE id = p_id;
  IF s.id IS NULL OR NOT public.shared_is_member(s.group_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT closed_at INTO closed FROM public.shared_groups WHERE id = s.group_id;
  IF closed IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  DELETE FROM public.shared_settlements WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_group_set_closed(p_group uuid, p_closed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  UPDATE public.shared_groups SET closed_at = CASE WHEN p_closed THEN now() ELSE NULL END WHERE id = p_group;
END;
$$;

-- Cambiar en qué categoría PROPIA cae tu parte (no afecta a la otra persona).
CREATE OR REPLACE FUNCTION public.shared_set_my_category(p_group uuid, p_category uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  UPDATE public.shared_group_members SET personal_category_id = p_category WHERE group_id = p_group AND user_id = uid;
  UPDATE public.expenses SET category_id = p_category
   WHERE user_id = uid AND shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE group_id = p_group);
END;
$$;

-- Nombres de los miembros (profiles es privado por usuario).
CREATE OR REPLACE FUNCTION public.shared_member_names(p_group uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, coalesce(nullif(trim(p.display_name), ''), split_part(m.invited_email, '@', 1))
  FROM public.shared_group_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group AND m.user_id IS NOT NULL AND m.status = 'accepted'
    AND (public.shared_is_member(p_group));
$$;

-- Quien invitó, para mostrarlo en la invitación pendiente.
CREATE OR REPLACE FUNCTION public.shared_inviter_name(p_group uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(p.display_name), ''), split_part(m.invited_email, '@', 1))
  FROM public.shared_groups g
  JOIN public.shared_group_members m ON m.group_id = g.id AND m.user_id = g.member_a
  LEFT JOIN public.profiles p ON p.id = g.member_a
  WHERE g.id = p_group AND (public.shared_is_member(p_group) OR public.shared_is_invited(p_group));
$$;

-- ── RLS: solo lectura directa; todo lo demás pasa por las funciones ─────────

ALTER TABLE public.shared_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_settlements   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read groups" ON public.shared_groups;
CREATE POLICY "members read groups" ON public.shared_groups
  FOR SELECT USING (public.shared_is_member(id) OR public.shared_is_invited(id));

DROP POLICY IF EXISTS "members read members" ON public.shared_group_members;
CREATE POLICY "members read members" ON public.shared_group_members
  FOR SELECT USING (
    public.shared_is_member(group_id)
    OR lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "members read expenses" ON public.shared_expenses;
CREATE POLICY "members read expenses" ON public.shared_expenses
  FOR SELECT USING (public.shared_is_member(group_id));

DROP POLICY IF EXISTS "members read settlements" ON public.shared_settlements;
CREATE POLICY "members read settlements" ON public.shared_settlements
  FOR SELECT USING (public.shared_is_member(group_id));

GRANT SELECT ON public.shared_groups, public.shared_group_members,
                public.shared_expenses, public.shared_settlements TO authenticated;

-- Funciones internas (prefijo shared__) sin acceso desde la app; las de la API
-- solo para usuarios autenticados.
REVOKE ALL ON FUNCTION public.shared__income_for(uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__income_ratio(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__shares(public.shared_groups, int, uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__sync_personal(public.shared_expenses) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__recalc_group(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__promote(uuid, uuid)                  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.shared_is_member(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_is_invited(uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_create(text, date, date, text, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_accept(uuid, uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_decline(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_ratio_propose(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_ratio_confirm(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_ratio_reject(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_save(uuid, uuid, text, text, date, int, uuid, uuid, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_delete(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_settle(uuid, uuid, uuid, int, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_settlement_delete(uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_set_closed(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_set_my_category(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_member_names(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_inviter_name(uuid)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.shared_is_member(uuid), public.shared_is_invited(uuid),
  public.shared_group_create(text, date, date, text, numeric, text, uuid),
  public.shared_group_accept(uuid, uuid), public.shared_group_decline(uuid),
  public.shared_ratio_propose(uuid, text, numeric), public.shared_ratio_confirm(uuid),
  public.shared_ratio_reject(uuid),
  public.shared_expense_save(uuid, uuid, text, text, date, int, uuid, uuid, text, int),
  public.shared_expense_delete(uuid), public.shared_settle(uuid, uuid, uuid, int, date),
  public.shared_settlement_delete(uuid), public.shared_group_set_closed(uuid, boolean),
  public.shared_set_my_category(uuid, uuid), public.shared_member_names(uuid),
  public.shared_inviter_name(uuid)
TO authenticated;
