-- Compartir el porcentaje es obligatorio en los viajes por sueldo (nov 2026)
--
-- Regla de producto: en un viaje "según lo que gana cada uno" todos comparten su PORCENTAJE
-- (nunca el sueldo). Ya no existe la opción de entrar o quedarse sin compartirlo.
-- Antes la pantalla lo dejaba elegir (income_consent); ahora se fuerza en la base, para que
-- valga también para quien llame a la API directo.

-- 1. Todo miembro que acepta queda con el consentimiento puesto, sin importar lo que se envíe.
CREATE OR REPLACE FUNCTION public.shared__force_consent()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'accepted' THEN NEW.income_consent := true; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shared_force_consent ON public.shared_group_members;
CREATE TRIGGER trg_shared_force_consent
  BEFORE INSERT OR UPDATE ON public.shared_group_members
  FOR EACH ROW EXECUTE FUNCTION public.shared__force_consent();

-- 2. Quienes ya estaban dentro sin compartir quedan compartiendo (el trigger lo aplica al actualizar).
UPDATE public.shared_group_members SET income_consent = true
 WHERE status = 'accepted' AND income_consent = false;

-- 3. Se recalculan los viajes por sueldo abiertos: los que estaban bloqueados por falta de
--    consentimiento se desbloquean si todos tienen ingresos.
DO $$
DECLARE g uuid;
BEGIN
  FOR g IN SELECT id FROM public.shared_groups WHERE split_mode = 'income' AND closed_at IS NULL LOOP
    PERFORM public.shared__recalc_group(g);
  END LOOP;
END $$;
