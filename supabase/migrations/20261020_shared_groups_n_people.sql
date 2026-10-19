-- ── Gastos compartidos v2: viajes de N personas, crear primero e invitar después ──
-- Cambios respecto de la fase 1 (20261018/19), que asumía exactamente dos
-- personas y las fechas obligatorias:
--
--   · Un viaje se crea SOLO con su creador y un nombre; las fechas son
--     opcionales y se pueden definir después. Se invita (por @usuario) cuando
--     quieras, a cuantas personas quieras.
--   · El reparto deja de ser un acuerdo de dos: el viaje tiene una regla
--     (`split_mode`: según sueldo o partes iguales) y cada gasto guarda lo que
--     le toca a CADA persona (shared_expense_shares), congelado.
--   · Un gasto puede ser de todos (se recalcula cuando entra o sale alguien) o
--     solo de algunos ("la cena fue de 3 de los 4").
--   · "Según sueldo" exige el consentimiento de CADA miembro: solo se comparte
--     el % de cada uno, nunca el ingreso (misma regla de la fase 1).
--
-- Las tablas shared_* estaban vacías (se verifica abajo): se recrean.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shared_groups) THEN
    RAISE EXCEPTION 'shared_groups no está vacía: migrar a mano antes de continuar';
  END IF;
END $$;

-- ── 0. Limpieza de la versión de dos personas ───────────────────────────────

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_shared_expense_id_fkey;
DROP TABLE IF EXISTS public.shared_settlements, public.shared_expense_shares,
                     public.shared_expenses, public.shared_group_members,
                     public.shared_groups CASCADE;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'shared\_%'
      AND p.proname NOT IN ('shared_find_user', 'shared__income_for', 'shared__gen_username')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- Un gasto compartido en el que pagaste todo por otros deja tu parte en $0,
-- pero la tarjeta igual te cobra: esa fila ($0 + card_extra) sostiene el
-- estado de cuenta. Solo las filas compartidas pueden valer 0.
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check
  CHECK (amount > 0 OR (amount = 0 AND shared_expense_id IS NOT NULL)) NOT VALID;
-- NOT VALID: las filas viejas ya cumplen amount > 0; solo se evalúan las nuevas.

-- ── 1. Tablas ───────────────────────────────────────────────────────────────

CREATE TABLE public.shared_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'household')),
  start_date  date,                                  -- opcionales: se definen cuando se sepa
  end_date    date,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  split_mode  text NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('income', 'equal')),
  -- 'no_income_data' = "según sueldo" no se puede calcular (falta el consentimiento
  -- o los ingresos de alguien); los gastos "según acuerdo" quedan como estaban.
  split_error text CHECK (split_error IN ('no_income_data')),
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE public.shared_group_members (
  group_id             uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  income_consent       boolean NOT NULL DEFAULT false,
  personal_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  invited_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at            timestamptz,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX shared_group_members_user_idx ON public.shared_group_members(user_id);

CREATE TABLE public.shared_expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  trip_category     text NOT NULL DEFAULT 'otros'
                    CHECK (trip_category IN ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros')),
  description       text NOT NULL,
  date              date NOT NULL,
  amount            integer NOT NULL CHECK (amount > 0),   -- CLP, cargo completo
  paid_by           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  -- group = según la regla del viaje · equal = partes iguales · exact = montos a mano
  split_kind        text NOT NULL DEFAULT 'group' CHECK (split_kind IN ('group', 'equal', 'exact')),
  -- true = de todos los miembros actuales (se recalcula si entra o sale alguien);
  -- false = solo de las personas que figuran en shared_expense_shares.
  everyone          boolean NOT NULL DEFAULT true,
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shared_expenses_group_idx ON public.shared_expenses(group_id, date DESC);

-- Lo que le toca a cada persona de cada gasto (suma exacta = amount).
CREATE TABLE public.shared_expense_shares (
  expense_id uuid NOT NULL REFERENCES public.shared_expenses(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share      integer NOT NULL CHECK (share >= 0),
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX shared_expense_shares_group_idx ON public.shared_expense_shares(group_id);

CREATE TABLE public.shared_settlements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  from_user  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     integer NOT NULL CHECK (amount > 0),
  date       date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX shared_settlements_group_idx ON public.shared_settlements(group_id);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_shared_expense_id_fkey
  FOREIGN KEY (shared_expense_id) REFERENCES public.shared_expenses(id) ON DELETE CASCADE;

-- ── 2. Pertenencia ──────────────────────────────────────────────────────────

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
    WHERE m.group_id = p_group AND m.status = 'pending' AND m.user_id = auth.uid()
  );
$$;

-- ── 3. Reparto (interno) ────────────────────────────────────────────────────

-- Peso de cada miembro aceptado en las reglas "según acuerdo". Enteros para que
-- el cálculo del servidor y el de la pantalla (lib/shared-split.ts) den
-- exactamente lo mismo:
--   · equal  → 1 para todos.
--   · income → su ingreso representativo / suma de los ingresos, ×1.000.000.
-- "Según sueldo" exige el consentimiento de cada miembro y que todos tengan
-- ingresos registrados; si no, falla con no_income_data (nunca se adivina).
-- Con un solo miembro no hace falta saber nada de ingresos.
CREATE OR REPLACE FUNCTION public.shared__member_weights(p_group uuid)
RETURNS TABLE (user_id uuid, w bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  SELECT count(*), sum(public.shared__income_for(m.user_id))
    INTO missing, total
  FROM public.shared_group_members m
  WHERE m.group_id = p_group AND m.status = 'accepted'
    AND public.shared__income_for(m.user_id) IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'no_income_data'; END IF;

  SELECT sum(public.shared__income_for(m.user_id)) INTO total
  FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted';
  IF total IS NULL OR total <= 0 THEN RAISE EXCEPTION 'no_income_data'; END IF;

  RETURN QUERY
    SELECT m.user_id,
           GREATEST(1, round(public.shared__income_for(m.user_id) * 1000000 / total))::bigint
    FROM public.shared_group_members m
    WHERE m.group_id = p_group AND m.status = 'accepted';
END;
$$;

-- Reparto de un monto entre personas, método del mayor resto:
--   parte = piso(monto × peso / suma de pesos); los pesos sobrantes se dan de a 1
--   a quienes tienen mayor resto (empate: primero quien NO pagó, luego por id).
-- Suma exacta, nunca negativo. lib/shared-split.ts hace lo mismo.
CREATE OR REPLACE FUNCTION public.shared__compute_shares(
  p_group uuid, p_amount int, p_paid_by uuid, p_kind text, p_participants uuid[], p_exact jsonb
) RETURNS TABLE (user_id uuid, share int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; sumw bigint; bad int; total bigint;
BEGIN
  IF p_kind = 'exact' THEN
    IF p_exact IS NULL OR jsonb_typeof(p_exact) <> 'object' THEN RAISE EXCEPTION 'invalid_exact_share'; END IF;
    SELECT array_agg(e.key::uuid) INTO ids FROM jsonb_each_text(p_exact) e;
    IF ids IS NULL THEN RAISE EXCEPTION 'invalid_participants'; END IF;
    SELECT count(*) INTO bad FROM unnest(ids) u
      WHERE NOT EXISTS (SELECT 1 FROM public.shared_group_members m
                        WHERE m.group_id = p_group AND m.user_id = u AND m.status = 'accepted');
    IF bad > 0 THEN RAISE EXCEPTION 'invalid_participants'; END IF;
    SELECT sum(e.value::bigint), count(*) FILTER (WHERE e.value::bigint < 0)
      INTO total, bad FROM jsonb_each_text(p_exact) e;
    IF total <> p_amount OR bad > 0 THEN RAISE EXCEPTION 'invalid_exact_share'; END IF;
    RETURN QUERY SELECT e.key::uuid, e.value::int FROM jsonb_each_text(p_exact) e;
    RETURN;
  END IF;

  ids := ARRAY(SELECT DISTINCT u FROM unnest(p_participants) u);
  IF coalesce(array_length(ids, 1), 0) = 0 THEN RAISE EXCEPTION 'invalid_participants'; END IF;
  SELECT count(*) INTO bad FROM unnest(ids) u
    WHERE NOT EXISTS (SELECT 1 FROM public.shared_group_members m
                      WHERE m.group_id = p_group AND m.user_id = u AND m.status = 'accepted');
  IF bad > 0 THEN RAISE EXCEPTION 'invalid_participants'; END IF;

  IF p_kind = 'equal' THEN
    RETURN QUERY
    WITH w AS (SELECT u AS uid, 1::bigint AS wt FROM unnest(ids) u),
    sw AS (SELECT sum(wt)::bigint AS s FROM w),
    base AS (
      SELECT w.uid, (p_amount::bigint * w.wt) / sw.s AS fl, (p_amount::bigint * w.wt) % sw.s AS rm
      FROM w, sw
    ),
    leftover AS (SELECT (p_amount - sum(fl))::bigint AS n FROM base),
    ranked AS (
      SELECT b.*, row_number() OVER (ORDER BY b.rm DESC, (b.uid = p_paid_by) ASC, b.uid ASC) AS rn FROM base b
    )
    SELECT r.uid, (r.fl + CASE WHEN r.rn <= (SELECT n FROM leftover) THEN 1 ELSE 0 END)::int FROM ranked r;
  ELSE
    RETURN QUERY
    WITH w AS (SELECT mw.user_id AS uid, mw.w AS wt FROM public.shared__member_weights(p_group) mw WHERE mw.user_id = ANY(ids)),
    sw AS (SELECT sum(wt)::bigint AS s FROM w),
    base AS (
      SELECT w.uid, (p_amount::bigint * w.wt) / sw.s AS fl, (p_amount::bigint * w.wt) % sw.s AS rm
      FROM w, sw
    ),
    leftover AS (SELECT (p_amount - sum(fl))::bigint AS n FROM base),
    ranked AS (
      SELECT b.*, row_number() OVER (ORDER BY b.rm DESC, (b.uid = p_paid_by) ASC, b.uid ASC) AS rn FROM base b
    )
    SELECT r.uid, (r.fl + CASE WHEN r.rn <= (SELECT n FROM leftover) THEN 1 ELSE 0 END)::int FROM ranked r;
  END IF;
END;
$$;

-- Guarda las partes de un gasto y las refleja en los gastos personales.
CREATE OR REPLACE FUNCTION public.shared__write_shares(p_expense uuid, p_group uuid, p_amount int,
  p_paid_by uuid, p_kind text, p_participants uuid[], p_exact jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uids uuid[]; shs int[];
BEGIN
  -- Se calcula ANTES de borrar: si algo falla, las partes anteriores quedan intactas.
  SELECT array_agg(c.user_id), array_agg(c.share) INTO uids, shs
  FROM public.shared__compute_shares(p_group, p_amount, p_paid_by, p_kind, p_participants, p_exact) c;
  DELETE FROM public.shared_expense_shares WHERE expense_id = p_expense;
  INSERT INTO public.shared_expense_shares (expense_id, group_id, user_id, share)
    SELECT p_expense, p_group, t.u, t.s FROM unnest(uids, shs) AS t(u, s);
END;
$$;

-- Refleja el gasto en el historial personal de cada persona involucrada:
-- solo su parte (D3). El pagador además guarda card_extra = lo que el banco le
-- cobra de más (la parte de los demás), aunque su propia parte sea $0.
CREATE OR REPLACE FUNCTION public.shared__sync_personal(p_expense uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      category_id = coalesce(public.expenses.category_id, EXCLUDED.category_id);
  END LOOP;
END;
$$;

-- Recalcula los gastos que dependen de quién está en el viaje o de la regla:
-- los "de todos" (según acuerdo o partes iguales) y los "según acuerdo" de un
-- grupo elegido. Los montos exactos no se tocan. Si "según sueldo" no se puede
-- calcular, esos gastos quedan como estaban y el viaje lo marca (split_error).
CREATE OR REPLACE FUNCTION public.shared__recalc_group(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.shared_expenses; parts uuid[]; weights_ok boolean := true;
BEGIN
  BEGIN
    PERFORM 1 FROM public.shared__member_weights(p_group);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_income_data' THEN RAISE; END IF;
    weights_ok := false;
  END;

  FOR e IN SELECT * FROM public.shared_expenses WHERE group_id = p_group AND split_kind IN ('group', 'equal') LOOP
    IF e.split_kind = 'group' AND NOT weights_ok THEN CONTINUE; END IF;
    IF e.split_kind = 'equal' AND NOT e.everyone THEN CONTINUE; END IF;
    IF e.everyone THEN
      parts := ARRAY(SELECT m.user_id FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted');
    ELSE
      parts := ARRAY(SELECT s.user_id FROM public.shared_expense_shares s WHERE s.expense_id = e.id);
      -- alguien salió del viaje: queda fuera del reparto
      parts := ARRAY(SELECT u FROM unnest(parts) u WHERE EXISTS (
        SELECT 1 FROM public.shared_group_members m WHERE m.group_id = p_group AND m.user_id = u AND m.status = 'accepted'));
      IF coalesce(array_length(parts, 1), 0) = 0 THEN CONTINUE; END IF;
    END IF;
    PERFORM public.shared__write_shares(e.id, p_group, e.amount, e.paid_by, e.split_kind, parts, NULL);
    UPDATE public.shared_expenses SET updated_at = now() WHERE id = e.id;
    PERFORM public.shared__sync_personal(e.id);
  END LOOP;

  UPDATE public.shared_groups SET split_error = CASE WHEN weights_ok THEN NULL ELSE 'no_income_data' END
   WHERE id = p_group;
END;
$$;

-- ── 4. API ──────────────────────────────────────────────────────────────────

-- Crear un viaje: solo nombre (fechas opcionales). Invitas después.
CREATE OR REPLACE FUNCTION public.shared_group_create(
  p_name text, p_start date, p_end date, p_split_mode text, p_category uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); gid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_split_mode NOT IN ('income', 'equal') THEN RAISE EXCEPTION 'invalid_split_mode'; END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  INSERT INTO public.shared_groups (name, kind, start_date, end_date, created_by, split_mode)
  VALUES (trim(p_name), 'event', p_start, p_end, uid, p_split_mode) RETURNING id INTO gid;
  -- Elegir "según sueldo" al crear es dar tu propio consentimiento.
  INSERT INTO public.shared_group_members (group_id, user_id, status, income_consent, personal_category_id, joined_at)
  VALUES (gid, uid, 'accepted', p_split_mode = 'income', p_category, now());
  RETURN gid;
END;
$$;

-- Nombre y fechas: cualquier miembro (las fechas se suelen definir después).
CREATE OR REPLACE FUNCTION public.shared_group_update(p_group uuid, p_name text, p_start date, p_end date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  UPDATE public.shared_groups SET name = trim(p_name), start_date = p_start, end_date = p_end WHERE id = p_group;
END;
$$;

-- Regla del viaje: solo quien lo creó. Cambiar a "según sueldo" da tu
-- consentimiento; cada uno de los demás tiene que dar el suyo.
CREATE OR REPLACE FUNCTION public.shared_group_set_mode(p_group uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_mode NOT IN ('income', 'equal') THEN RAISE EXCEPTION 'invalid_split_mode'; END IF;
  UPDATE public.shared_groups SET split_mode = p_mode WHERE id = p_group;
  IF p_mode = 'income' THEN
    UPDATE public.shared_group_members SET income_consent = true WHERE group_id = p_group AND user_id = auth.uid();
  END IF;
  PERFORM public.shared__recalc_group(p_group);
END;
$$;

-- Dar (o retirar) tu consentimiento para calcular el % con los ingresos.
CREATE OR REPLACE FUNCTION public.shared_give_consent(p_group uuid, p_consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  UPDATE public.shared_group_members SET income_consent = coalesce(p_consent, false)
   WHERE group_id = p_group AND user_id = auth.uid();
  PERFORM public.shared__recalc_group(p_group);
END;
$$;

-- Invitar por @usuario (quien creó el viaje). Se puede invitar a cuantas personas quieras.
CREATE OR REPLACE FUNCTION public.shared_group_invite(p_group uuid, p_username text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; invitee uuid; cur text; uname text := lower(trim(both '@ ' from coalesce(p_username, '')));
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  SELECT id INTO invitee FROM public.profiles WHERE username = uname AND discoverable;
  IF invitee IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF invitee = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;
  SELECT status INTO cur FROM public.shared_group_members WHERE group_id = p_group AND user_id = invitee;
  IF cur = 'accepted' THEN RAISE EXCEPTION 'already_member'; END IF;
  IF cur = 'pending'  THEN RAISE EXCEPTION 'already_invited'; END IF;
  INSERT INTO public.shared_group_members (group_id, user_id, status, invited_by)
  VALUES (p_group, invitee, 'pending', auth.uid())
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'pending', invited_by = EXCLUDED.invited_by,
    income_consent = false, joined_at = NULL;
END;
$$;

-- Aceptar la invitación. Si el viaje es "según sueldo", aceptar con
-- p_consent = true es dar tu consentimiento (sin él no se puede calcular tu parte).
CREATE OR REPLACE FUNCTION public.shared_group_accept(p_group uuid, p_category uuid, p_consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  UPDATE public.shared_group_members
     SET status = 'accepted', joined_at = now(), personal_category_id = p_category,
         income_consent = coalesce(p_consent, false)
   WHERE group_id = p_group AND user_id = uid AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_available'; END IF;
  PERFORM public.shared__recalc_group(p_group);
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_group_decline(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.shared_group_members SET status = 'declined'
   WHERE group_id = p_group AND status = 'pending' AND user_id = auth.uid();
END;
$$;

-- Salir del viaje, o (quien lo creó) sacar a alguien o cancelar una invitación.
-- Alguien que ya pagó, o que figura en un gasto "solo de algunos" o en una
-- transferencia, no puede salir: se rompería la cuenta.
CREATE OR REPLACE FUNCTION public.shared_member_remove(p_group uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.shared_groups; st text;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF p_user <> auth.uid() AND g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_user = g.created_by THEN RAISE EXCEPTION 'creator_cannot_leave'; END IF;
  SELECT status INTO st FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_user;
  IF st IS NULL THEN RETURN; END IF;
  IF st = 'accepted' THEN
    IF EXISTS (SELECT 1 FROM public.shared_expenses x WHERE x.group_id = p_group AND x.paid_by = p_user)
       OR EXISTS (SELECT 1 FROM public.shared_expense_shares s JOIN public.shared_expenses x ON x.id = s.expense_id
                  WHERE s.group_id = p_group AND s.user_id = p_user AND NOT x.everyone)
       OR EXISTS (SELECT 1 FROM public.shared_settlements t WHERE t.group_id = p_group AND (t.from_user = p_user OR t.to_user = p_user)) THEN
      RAISE EXCEPTION 'member_has_activity';
    END IF;
  END IF;
  DELETE FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_user;
  PERFORM public.shared__recalc_group(p_group);
END;
$$;

-- Crear o editar un gasto del viaje. p_participants null = de todos los
-- miembros (se recalcula si entra o sale alguien).
CREATE OR REPLACE FUNCTION public.shared_expense_save(
  p_id uuid, p_group uuid, p_trip_category text, p_description text, p_date date,
  p_amount int, p_paid_by uuid, p_payment_method uuid, p_split_kind text,
  p_participants uuid[], p_exact jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g public.shared_groups; e public.shared_expenses; old public.shared_expenses;
        pm uuid := p_payment_method; every boolean := (p_participants IS NULL); parts uuid[];
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(trim(p_description), '') = '' THEN RAISE EXCEPTION 'description_required'; END IF;
  IF p_split_kind NOT IN ('group', 'equal', 'exact') THEN RAISE EXCEPTION 'invalid_split_kind'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_paid_by AND status = 'accepted') THEN
    RAISE EXCEPTION 'invalid_payer';
  END IF;
  IF p_split_kind = 'exact' THEN every := false; END IF;
  IF p_split_kind = 'group' AND g.split_error IS NOT NULL THEN RAISE EXCEPTION 'no_income_data'; END IF;

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

  IF every THEN
    parts := ARRAY(SELECT m.user_id FROM public.shared_group_members m WHERE m.group_id = p_group AND m.status = 'accepted');
  ELSE
    parts := p_participants;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.shared_expenses
      (group_id, trip_category, description, date, amount, paid_by, payment_method_id, split_kind, everyone, created_by)
    VALUES (p_group, p_trip_category, trim(p_description), p_date, p_amount, p_paid_by, pm, p_split_kind, every, uid)
    RETURNING * INTO e;
  ELSE
    UPDATE public.shared_expenses SET
      trip_category = p_trip_category, description = trim(p_description), date = p_date, amount = p_amount,
      paid_by = p_paid_by, payment_method_id = pm, split_kind = p_split_kind, everyone = every,
      updated_by = uid, updated_at = now()
    WHERE id = p_id RETURNING * INTO e;
  END IF;

  PERFORM public.shared__write_shares(e.id, p_group, p_amount, p_paid_by, p_split_kind, parts, p_exact);
  PERFORM public.shared__sync_personal(e.id);
  RETURN e.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_expense_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.shared_expenses;
BEGIN
  SELECT * INTO e FROM public.shared_expenses WHERE id = p_id;
  IF e.id IS NULL OR NOT public.shared_is_member(e.group_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = e.group_id AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  DELETE FROM public.shared_expenses WHERE id = p_id;   -- partes y filas personales caen por ON DELETE CASCADE
END;
$$;

-- Saldar: cualquier miembro registra que hubo una transferencia entre dos
-- miembros. No crea gastos ni ingresos (la plata ya se contó una vez).
CREATE OR REPLACE FUNCTION public.shared_settle(p_group uuid, p_from uuid, p_to uuid, p_amount int, p_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_from = p_to
     OR NOT EXISTS (SELECT 1 FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_from AND status = 'accepted')
     OR NOT EXISTS (SELECT 1 FROM public.shared_group_members WHERE group_id = p_group AND user_id = p_to AND status = 'accepted') THEN
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  INSERT INTO public.shared_settlements (group_id, from_user, to_user, amount, date)
  VALUES (p_group, p_from, p_to, p_amount, p_date) RETURNING id INTO sid;
  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_settlement_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.shared_settlements;
BEGIN
  SELECT * INTO s FROM public.shared_settlements WHERE id = p_id;
  IF s.id IS NULL OR NOT public.shared_is_member(s.group_id) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF EXISTS (SELECT 1 FROM public.shared_groups WHERE id = s.group_id AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'group_closed'; END IF;
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

-- Cambiar en qué categoría PROPIA cae tu parte (no afecta a nadie más).
CREATE OR REPLACE FUNCTION public.shared_set_my_category(p_group uuid, p_category uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RAISE EXCEPTION 'not_member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN RAISE EXCEPTION 'invalid_category'; END IF;
  UPDATE public.shared_group_members SET personal_category_id = p_category WHERE group_id = p_group AND user_id = uid;
  UPDATE public.expenses SET category_id = p_category
   WHERE user_id = uid AND shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE group_id = p_group);
END;
$$;

-- ── 5. Lecturas auxiliares ──────────────────────────────────────────────────

-- Personas del viaje (aceptadas y pendientes) con lo necesario para mostrarlas.
CREATE OR REPLACE FUNCTION public.shared_member_names(p_group uuid)
RETURNS TABLE (user_id uuid, display_name text, username text, avatar_url text,
               status text, income_consent boolean, is_creator boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, coalesce(nullif(trim(p.display_name), ''), '@' || p.username), p.username, p.avatar_url,
         m.status, m.income_consent, (m.user_id = g.created_by)
  FROM public.shared_group_members m
  JOIN public.shared_groups g ON g.id = m.group_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group AND m.status IN ('accepted', 'pending')
    AND public.shared_is_member(p_group);
$$;

-- Pesos del reparto "según acuerdo" de los miembros actuales; vacío si no se
-- puede calcular. Es lo que usa la pantalla para mostrar las partes antes de guardar.
CREATE OR REPLACE FUNCTION public.shared_group_weights(p_group uuid)
RETURNS TABLE (user_id uuid, w bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.shared_is_member(p_group) THEN RETURN; END IF;
  BEGIN
    RETURN QUERY SELECT * FROM public.shared__member_weights(p_group);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_income_data' THEN RAISE; END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_inviter_name(p_group uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(p.display_name), ''), '@' || p.username)
  FROM public.shared_groups g
  JOIN public.profiles p ON p.id = g.created_by
  WHERE g.id = p_group AND (public.shared_is_member(p_group) OR public.shared_is_invited(p_group));
$$;

-- ── 6. RLS: solo lectura directa; todo lo demás pasa por las funciones ──────

ALTER TABLE public.shared_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_settlements    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read groups" ON public.shared_groups
  FOR SELECT USING (public.shared_is_member(id) OR public.shared_is_invited(id));
CREATE POLICY "members read members" ON public.shared_group_members
  FOR SELECT USING (public.shared_is_member(group_id) OR user_id = auth.uid());
CREATE POLICY "members read expenses" ON public.shared_expenses
  FOR SELECT USING (public.shared_is_member(group_id));
CREATE POLICY "members read shares" ON public.shared_expense_shares
  FOR SELECT USING (public.shared_is_member(group_id));
CREATE POLICY "members read settlements" ON public.shared_settlements
  FOR SELECT USING (public.shared_is_member(group_id));

GRANT SELECT ON public.shared_groups, public.shared_group_members, public.shared_expenses,
                public.shared_expense_shares, public.shared_settlements TO authenticated;

-- ── 7. Permisos de las funciones ────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.shared__member_weights(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__compute_shares(uuid, int, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__write_shares(uuid, uuid, int, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__sync_personal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared__recalc_group(uuid)  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.shared_is_member(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_is_invited(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_create(text, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_update(uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_set_mode(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_give_consent(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_accept(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_decline(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_member_remove(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_save(uuid, uuid, text, text, date, int, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_expense_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_settle(uuid, uuid, uuid, int, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_settlement_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_set_closed(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_set_my_category(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_member_names(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_weights(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_inviter_name(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.shared_is_member(uuid), public.shared_is_invited(uuid),
  public.shared_group_create(text, date, date, text, uuid),
  public.shared_group_update(uuid, text, date, date),
  public.shared_group_set_mode(uuid, text),
  public.shared_give_consent(uuid, boolean),
  public.shared_group_invite(uuid, text),
  public.shared_group_accept(uuid, uuid, boolean),
  public.shared_group_decline(uuid),
  public.shared_member_remove(uuid, uuid),
  public.shared_expense_save(uuid, uuid, text, text, date, int, uuid, uuid, text, uuid[], jsonb),
  public.shared_expense_delete(uuid),
  public.shared_settle(uuid, uuid, uuid, int, date),
  public.shared_settlement_delete(uuid),
  public.shared_group_set_closed(uuid, boolean),
  public.shared_set_my_category(uuid, uuid),
  public.shared_member_names(uuid),
  public.shared_group_weights(uuid),
  public.shared_inviter_name(uuid)
TO authenticated;
