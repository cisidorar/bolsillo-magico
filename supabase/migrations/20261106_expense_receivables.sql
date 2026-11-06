-- ── Por cobrar (nov 2026) ───────────────────────────────────────────────────
-- Cas: "tengo un gasto en donde puse mi tarjeta de crédito y mis amigos iban a
-- depositarme a mi cuenta corriente". Amigos SIN la app (para gente con la app
-- están los viajes de Compartidos).
--
-- Modelo — reusa la cuadratura de tarjeta de Compartidos (D4):
--   expenses.amount      = TU parte (lo único que cuenta en análisis/presupuesto)
--   expenses.card_extra  = lo que pagaste por otros (el estado de cuenta suma
--                          amount + card_extra, así sigue cuadrando con el banco)
--   expense_receivables  = una fila por persona: cuánto te debe y si ya pagó.
--
-- Invariante: amount + card_extra = lo que cobró la tarjeta (no cambia al
-- dividir), y card_extra = Σ partes NO asumidas. Asumir una parte ("no me lo
-- va a pagar") la mueve de card_extra a amount: pasa a ser gasto tuyo.
-- Recibir la transferencia NO es ingreso ni toca el gasto: solo cierra la deuda.

CREATE TABLE IF NOT EXISTS public.expense_receivables (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_id                 uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  person_name                text NOT NULL CHECK (char_length(btrim(person_name)) BETWEEN 1 AND 60),
  amount                     integer NOT NULL CHECK (amount > 0),
  received_at                date,
  received_payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  forgiven                   boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (forgiven AND received_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS expense_receivables_user_pending_idx
  ON public.expense_receivables(user_id) WHERE received_at IS NULL AND NOT forgiven;
CREATE INDEX IF NOT EXISTS expense_receivables_expense_idx
  ON public.expense_receivables(expense_id);

ALTER TABLE public.expense_receivables ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_receivables TO authenticated;
GRANT ALL ON public.expense_receivables TO service_role;

DROP POLICY IF EXISTS expense_receivables_own ON public.expense_receivables;
CREATE POLICY expense_receivables_own ON public.expense_receivables
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Si pagaste TODO por otros (tu parte = 0), el gasto queda con amount 0 y el
-- total en card_extra — igual que un gasto de viaje donde no participaste.
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check
  CHECK (amount > 0 OR (amount = 0 AND (shared_expense_id IS NOT NULL OR card_extra > 0))) NOT VALID;

-- ── Guardar el reparto (atómico) ────────────────────────────────────────────
-- p_people: [{ "id": uuid|null, "name": text, "amount": int }] — solo las
-- partes NO asumidas. Las ya recibidas no se pueden cambiar de monto ni borrar
-- (ya entró la plata); las asumidas no se tocan. SECURITY INVOKER: corre con
-- la RLS del usuario, así que solo puede tocar sus propios gastos.
CREATE OR REPLACE FUNCTION public.receivables_save_split(p_expense_id uuid, p_people jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  e        public.expenses%ROWTYPE;
  total    integer;
  p        jsonb;
  pid      uuid;
  pname    text;
  pamount  integer;
  keep_ids uuid[] := '{}';
  owed     integer;
  r        public.expense_receivables%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = p_expense_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
  IF e.shared_expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este gasto es de un viaje compartido: se reparte desde Compartidos';
  END IF;
  total := e.amount + e.card_extra;

  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) LOOP
    pid     := nullif(p->>'id', '')::uuid;
    pname   := btrim(coalesce(p->>'name', ''));
    pamount := (p->>'amount')::integer;
    IF pname = '' THEN RAISE EXCEPTION 'Falta el nombre de una persona'; END IF;
    IF pamount IS NULL OR pamount <= 0 THEN RAISE EXCEPTION 'Monto inválido para %', pname; END IF;

    IF pid IS NOT NULL THEN
      SELECT * INTO r FROM public.expense_receivables WHERE id = pid AND expense_id = e.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Persona no encontrada en este gasto'; END IF;
      IF r.forgiven THEN CONTINUE; END IF;
      IF r.received_at IS NOT NULL AND r.amount <> pamount THEN
        RAISE EXCEPTION '% ya te pagó: no se puede cambiar su monto', r.person_name;
      END IF;
      UPDATE public.expense_receivables SET person_name = pname, amount = pamount WHERE id = pid;
      keep_ids := keep_ids || pid;
    ELSE
      INSERT INTO public.expense_receivables (user_id, expense_id, person_name, amount)
      VALUES (e.user_id, e.id, pname, pamount) RETURNING id INTO pid;
      keep_ids := keep_ids || pid;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.expense_receivables
             WHERE expense_id = e.id AND received_at IS NOT NULL AND NOT (id = ANY(keep_ids))) THEN
    RAISE EXCEPTION 'No se puede quitar a alguien que ya te pagó';
  END IF;
  DELETE FROM public.expense_receivables
   WHERE expense_id = e.id AND NOT forgiven AND NOT (id = ANY(keep_ids));

  SELECT coalesce(sum(amount), 0) INTO owed
    FROM public.expense_receivables WHERE expense_id = e.id AND NOT forgiven;
  IF owed > total THEN RAISE EXCEPTION 'Lo que te deben supera lo que cobró la tarjeta'; END IF;

  -- Si owed = total, pagaste todo por otros: tu parte queda en 0 (permitido por el CHECK).
  UPDATE public.expenses SET amount = total - owed, card_extra = owed WHERE id = e.id;
END;
$$;

-- ── Asumir una parte ("no me lo va a pagar") ────────────────────────────────
CREATE OR REPLACE FUNCTION public.receivables_forgive(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r public.expense_receivables%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.expense_receivables WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontrado'; END IF;
  IF r.forgiven THEN RETURN; END IF;
  IF r.received_at IS NOT NULL THEN RAISE EXCEPTION '% ya te pagó', r.person_name; END IF;
  UPDATE public.expense_receivables SET forgiven = true WHERE id = r.id;
  UPDATE public.expenses SET amount = amount + r.amount, card_extra = card_extra - r.amount WHERE id = r.expense_id;
END;
$$;

-- ── Deshacer "lo asumo" (vuelve a quedar por cobrar) ────────────────────────
CREATE OR REPLACE FUNCTION public.receivables_unforgive(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r public.expense_receivables%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.expense_receivables WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontrado'; END IF;
  IF NOT r.forgiven THEN RETURN; END IF;
  UPDATE public.expense_receivables SET forgiven = false WHERE id = r.id;
  UPDATE public.expenses SET amount = amount - r.amount, card_extra = card_extra + r.amount WHERE id = r.expense_id;
END;
$$;

-- ── Quitar el reparto completo (vuelve a ser 100% tuyo) ─────────────────────
CREATE OR REPLACE FUNCTION public.receivables_remove_split(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE e public.expenses%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = p_expense_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto no encontrado'; END IF;
  IF e.shared_expense_id IS NOT NULL THEN RAISE EXCEPTION 'Este gasto es de un viaje compartido'; END IF;
  IF EXISTS (SELECT 1 FROM public.expense_receivables WHERE expense_id = e.id AND received_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Alguien ya te pagó su parte: quita solo a los que faltan';
  END IF;
  DELETE FROM public.expense_receivables WHERE expense_id = e.id;
  UPDATE public.expenses SET amount = e.amount + e.card_extra, card_extra = 0 WHERE id = e.id;
END;
$$;

REVOKE ALL ON FUNCTION public.receivables_save_split(uuid, jsonb)  FROM public, anon;
REVOKE ALL ON FUNCTION public.receivables_forgive(uuid)            FROM public, anon;
REVOKE ALL ON FUNCTION public.receivables_unforgive(uuid)          FROM public, anon;
REVOKE ALL ON FUNCTION public.receivables_remove_split(uuid)       FROM public, anon;
GRANT EXECUTE ON FUNCTION public.receivables_save_split(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receivables_forgive(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.receivables_unforgive(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.receivables_remove_split(uuid)      TO authenticated;
