-- Ingreso declarado para repartir según sueldo (nov 2026)
--
-- Quien entra a un viaje "según lo que gana cada uno" y aún no tiene ingresos en /ingresos no
-- tenía cómo aportar su parte: el reparto quedaba en no_income_data. Ahora puede declarar su
-- ingreso mensual promedio al aceptar (o desde el viaje).
--
-- PRIVACIDAD: va en una tabla propia que solo su dueño puede leer. NO se guarda en
-- shared_group_members.guest_income porque cualquier miembro del viaje puede leer esa columna
-- (política "members read members"). Los demás solo ven el porcentaje que sale del reparto.
-- Si la persona tiene ingresos en /ingresos, mandan esos; el declarado es el respaldo.

CREATE TABLE IF NOT EXISTS public.shared_declared_income (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     numeric NOT NULL CHECK (amount > 0 AND amount <= 1000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_declared_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own declared income" ON public.shared_declared_income;
CREATE POLICY "own declared income" ON public.shared_declared_income
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Solo lectura propia; escribir pasa por shared_my_income_set.
REVOKE ALL ON public.shared_declared_income FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shared_declared_income TO authenticated;

-- Ingreso de un miembro: sus ingresos registrados, luego el declarado, luego el promedio que
-- puso quien lo invitó (personas sin cuenta que se registraron después).
CREATE OR REPLACE FUNCTION public.shared__member_income(p_group uuid, p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN m.guest_name IS NOT NULL THEN m.guest_income
              ELSE coalesce(
                     public.shared__income_for(m.user_id),
                     (SELECT d.amount FROM public.shared_declared_income d WHERE d.user_id = m.user_id),
                     m.guest_income) END
  FROM public.shared_group_members m
  WHERE m.group_id = p_group AND m.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION public.shared__member_income(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Declara (o cambia) mi ingreso mensual promedio y recalcula los viajes por sueldo en que estoy.
CREATE OR REPLACE FUNCTION public.shared_my_income_set(p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); g uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000 THEN RAISE EXCEPTION 'invalid_declared_income'; END IF;

  INSERT INTO public.shared_declared_income (user_id, amount) VALUES (uid, round(p_amount))
  ON CONFLICT (user_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();

  FOR g IN
    SELECT m.group_id FROM public.shared_group_members m
    JOIN public.shared_groups sg ON sg.id = m.group_id
    WHERE m.user_id = uid AND m.status = 'accepted' AND sg.split_mode = 'income' AND sg.closed_at IS NULL
  LOOP
    PERFORM public.shared__recalc_group(g);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.shared_my_income_set(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_my_income_set(numeric) TO authenticated;
