-- Perfil al registrarse (nov 2026). Quien llega por invitación solo crea contraseña; su
-- perfil nacía con el correo como nombre, y ese nombre es lo que ven las otras personas
-- en un viaje compartido (el correo no debe quedar a la vista). Ahora:
--   1. profiles.onboarded_at: null hasta que la persona completa "Tu perfil" (/bienvenida).
--      Las cuentas que ya existen quedan como completas.
--   2. handle_new_user ya no usa el correo completo como nombre: usa el nombre de la
--      invitación si lo hay, y si no la parte antes de la @ (se edita en /bienvenida).
--   3. Limpieza: perfiles cuyo nombre es un correo pasan a la parte antes de la @.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
UPDATE public.profiles SET onboarded_at = now() WHERE onboarded_at IS NULL;

UPDATE public.profiles SET display_name = split_part(display_name, '@', 1)
 WHERE display_name LIKE '%@%' AND split_part(display_name, '@', 1) <> '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  PERFORM public.seed_user_defaults(new.id);
  RETURN new;
END;
$$;
