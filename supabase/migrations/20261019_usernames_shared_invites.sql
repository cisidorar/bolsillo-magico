-- ── Usuario único (@usuario) para invitar a viajes compartidos ──────────────
-- Estilo Discord: cada persona tiene un @usuario único; para invitar se busca
-- por ese usuario (búsqueda EXACTA, nunca una lista) en vez de escribir un
-- correo. Así el correo de nadie se comparte con nadie.
--
-- Privacidad:
--   · shared_find_user devuelve solo usuario, nombre y foto — jamás el id ni
--     el correo — y solo si la persona dejó activado `discoverable`.
--   · La invitación se guarda por user_id; ya no existe invited_email, así que
--     quien invita no puede leer el correo de la otra persona.
--
-- La tabla shared_group_members estaba vacía cuando se escribió esto (la fase 1
-- se aplicó el 18 oct y todavía no se usaba): la migración lo verifica y falla
-- si no es así, en vez de perder invitaciones.

-- ── 1. Usuario en profiles ──────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username     text,
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true;

-- 3 a 20 caracteres: minúsculas, números, "_" y "."; empieza y termina con
-- letra o número; sin separadores seguidos ("a..b", "a_.b").
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (
  username IS NULL OR (
    username ~ '^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$' AND username !~ '[_.]{2}'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles(username);

COMMENT ON COLUMN public.profiles.username IS
  'Usuario único para que otra persona te encuentre e invite (@usuario). Búsqueda exacta vía shared_find_user.';
COMMENT ON COLUMN public.profiles.discoverable IS
  'false = nadie puede encontrarte ni invitarte por @usuario.';

-- Genera un usuario libre a partir del nombre (o del correo). Interna.
CREATE OR REPLACE FUNCTION public.shared__gen_username(p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; cand text; n int := 0; src text;
BEGIN
  SELECT coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'usuario')
    INTO src
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user;
  -- Si el "nombre" es en realidad un correo, usa solo lo que va antes de la @.
  src := split_part(coalesce(src, 'usuario'), '@', 1);

  base := lower(translate(src, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'));
  base := regexp_replace(base, '[^a-z0-9_.]', '', 'g');
  base := regexp_replace(base, '[_.]{2,}', '_', 'g');
  base := regexp_replace(base, '^[_.]+|[_.]+$', '', 'g');
  IF length(base) < 3 THEN base := rpad(base, 3, '0'); END IF;
  IF base = '' OR length(base) < 3 THEN base := 'usuario'; END IF;
  base := left(base, 16);
  base := regexp_replace(base, '[_.]+$', '', 'g');

  cand := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = cand AND id <> p_user) LOOP
    n := n + 1;
    cand := left(base, 20 - length(n::text)) || n::text;
  END LOOP;
  RETURN cand;
END;
$$;

-- Todos los usuarios existentes quedan con un @usuario (editable).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE username IS NULL LOOP
    UPDATE public.profiles SET username = public.shared__gen_username(r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Para cuentas nuevas (el trigger de alta no asigna usuario): la app lo pide
-- al abrir Compartidos y queda fijo desde ese momento.
CREATE OR REPLACE FUNCTION public.ensure_my_username()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); u text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT username INTO u FROM public.profiles WHERE id = uid;
  IF u IS NULL THEN
    u := public.shared__gen_username(uid);
    -- upsert: hay cuentas sin fila en profiles
    INSERT INTO public.profiles (id, username) VALUES (uid, u)
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;
  END IF;
  RETURN u;
END;
$$;

-- Búsqueda EXACTA por usuario. No devuelve id ni correo.
CREATE OR REPLACE FUNCTION public.shared_find_user(p_username text)
RETURNS TABLE (username text, display_name text, avatar_url text, is_self boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.username,
         coalesce(nullif(trim(p.display_name), ''), '@' || p.username),
         p.avatar_url,
         (p.id = auth.uid())
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.username = lower(trim(both '@ ' from coalesce(p_username, '')))
    AND (p.discoverable OR p.id = auth.uid());
$$;

-- ── 2. Invitaciones por usuario, no por correo ──────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shared_group_members) THEN
    RAISE EXCEPTION 'shared_group_members no está vacía: migrar las invitaciones a mano antes de continuar';
  END IF;
END $$;

-- La política vieja depende de invited_email: se suelta antes de borrar la columna.
DROP POLICY IF EXISTS "members read members" ON public.shared_group_members;
ALTER TABLE public.shared_group_members DROP CONSTRAINT IF EXISTS shared_group_members_pkey;
ALTER TABLE public.shared_group_members DROP COLUMN IF EXISTS invited_email;
ALTER TABLE public.shared_group_members ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.shared_group_members ADD PRIMARY KEY (group_id, user_id);

CREATE OR REPLACE FUNCTION public.shared_is_invited(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_group_members m
    WHERE m.group_id = p_group AND m.status = 'pending' AND m.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "members read members" ON public.shared_group_members;
CREATE POLICY "members read members" ON public.shared_group_members
  FOR SELECT USING (public.shared_is_member(group_id) OR user_id = auth.uid());

DROP FUNCTION IF EXISTS public.shared_group_create(text, date, date, text, numeric, text, uuid);
CREATE OR REPLACE FUNCTION public.shared_group_create(
  p_name text, p_start date, p_end date,
  p_split_mode text, p_fixed_ratio numeric,
  p_username text, p_category uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); gid uuid; invitee uuid; uname text := lower(trim(both '@ ' from coalesce(p_username, '')));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF uname = '' THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p_split_mode NOT IN ('income', 'equal', 'fixed') THEN RAISE EXCEPTION 'invalid_split_mode'; END IF;
  IF p_split_mode = 'fixed' AND (p_fixed_ratio IS NULL OR p_fixed_ratio < 0 OR p_fixed_ratio > 1) THEN
    RAISE EXCEPTION 'invalid_ratio';
  END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  SELECT id INTO invitee FROM public.profiles WHERE username = uname AND discoverable;
  IF invitee IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF invitee = uid THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;

  INSERT INTO public.shared_groups
    (name, kind, start_date, end_date, member_a, pending_mode, pending_ratio_a, pending_by)
  VALUES
    (trim(p_name), 'event', p_start, p_end, uid, p_split_mode,
     CASE p_split_mode WHEN 'equal' THEN 0.5 WHEN 'fixed' THEN round(p_fixed_ratio, 4) ELSE NULL END, uid)
  RETURNING id INTO gid;

  INSERT INTO public.shared_group_members (group_id, user_id, status, income_consent, personal_category_id, joined_at)
  VALUES (gid, uid, 'accepted', p_split_mode = 'income', p_category, now());
  INSERT INTO public.shared_group_members (group_id, user_id, status)
  VALUES (gid, invitee, 'pending');
  RETURN gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.shared_group_accept(p_group uuid, p_category uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g public.shared_groups;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group FOR UPDATE;
  IF g.id IS NULL OR g.member_b IS NOT NULL THEN RAISE EXCEPTION 'invite_not_available'; END IF;
  UPDATE public.shared_group_members
     SET status = 'accepted', joined_at = now(), personal_category_id = p_category
   WHERE group_id = p_group AND user_id = uid AND status = 'pending';
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
   WHERE group_id = p_group AND status = 'pending' AND user_id = auth.uid();
END;
$$;

-- Miembros del viaje (también el invitado pendiente), con usuario y estado.
DROP FUNCTION IF EXISTS public.shared_member_names(uuid);
CREATE OR REPLACE FUNCTION public.shared_member_names(p_group uuid)
RETURNS TABLE (user_id uuid, display_name text, username text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, coalesce(nullif(trim(p.display_name), ''), '@' || p.username), p.username, m.status
  FROM public.shared_group_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group AND m.status IN ('accepted', 'pending')
    AND public.shared_is_member(p_group);
$$;

CREATE OR REPLACE FUNCTION public.shared_inviter_name(p_group uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(p.display_name), ''), '@' || p.username)
  FROM public.shared_groups g
  JOIN public.profiles p ON p.id = g.member_a
  WHERE g.id = p_group AND (public.shared_is_member(p_group) OR public.shared_is_invited(p_group));
$$;

-- ── 3. Permisos ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.shared__gen_username(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_my_username()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_find_user(text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_group_create(text, date, date, text, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_member_names(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_username(), public.shared_find_user(text),
  public.shared_group_create(text, date, date, text, numeric, text, uuid),
  public.shared_member_names(uuid)
TO authenticated;
