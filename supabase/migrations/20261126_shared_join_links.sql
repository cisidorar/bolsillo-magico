-- Enlace de invitación a un viaje, como el de Airbnb (nov 2026).
--
-- Quien creó el viaje genera un enlace y lo manda por WhatsApp. La persona lo abre, ve una
-- vista previa SIN montos (nombre, fechas y quiénes van), inicia sesión y toca "Unirme": entra
-- directo al viaje. Quien no tiene cuenta no puede unirse (la app sigue por invitación): desde
-- el enlace pide acceso en la lista de espera.
--
-- Reusa shared_group_share_links con una columna `kind`: 'view' es el enlace de solo lectura
-- que ya existía y 'join' es este. Crear o desactivar uno no toca al otro. El token se muestra
-- una sola vez y en la base solo queda su hash. Vence a los 30 días, al cerrar el viaje o al
-- desactivarlo. Tope de 15 personas (aceptadas + pendientes).

ALTER TABLE public.shared_group_share_links
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'view' CHECK (kind IN ('view', 'join'));

-- El enlace de solo lectura ya no debe revocar ni leer los de unión.
CREATE OR REPLACE FUNCTION public.shared_link_create(p_group uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; tok text;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL AND kind = 'view';
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.shared_group_share_links (group_id, token_hash, created_by, expires_at, kind)
  VALUES (p_group, public.shared__token_hash(tok), auth.uid(), now() + interval '90 days', 'view');
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.shared_link_revoke(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'only_creator';
  END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL AND kind = 'view';
END $$;

-- shared_link_view: misma función de 20261123 pero solo acepta enlaces 'view'.
DO $$
DECLARE def text; patched text;
BEGIN
  SELECT pg_get_functiondef('public.shared_link_view(text)'::regprocedure) INTO def;
  IF def NOT LIKE '%kind = ''view''%' THEN
    patched := replace(def, 'AND revoked_at IS NULL AND expires_at > now()', 'AND revoked_at IS NULL AND kind = ''view'' AND expires_at > now()');
    IF patched = def THEN RAISE EXCEPTION 'No se pudo parchar shared_link_view: revisa el texto de la función'; END IF;
    EXECUTE patched;
  END IF;
END $$;

-- ── Crear / desactivar el enlace de invitación ──────────────────────────────
CREATE OR REPLACE FUNCTION public.shared_join_link_create(p_group uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; tok text;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  IF g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL AND kind = 'join';
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.shared_group_share_links (group_id, token_hash, created_by, expires_at, kind)
  VALUES (p_group, public.shared__token_hash(tok), auth.uid(), now() + interval '30 days', 'join');
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.shared_join_link_revoke(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'only_creator';
  END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL AND kind = 'join';
END $$;

-- ── Vista previa pública: sin montos ni sueldos ─────────────────────────────
-- Devuelve null si el enlace no existe, venció, se desactivó o el viaje se cerró.
CREATE OR REPLACE FUNCTION public.shared_join_preview(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.shared_group_share_links; g public.shared_groups; n int;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.shared_group_share_links
   WHERE token_hash = public.shared__token_hash(p_token) AND kind = 'join' AND revoked_at IS NULL AND expires_at > now();
  IF l.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = l.group_id;
  IF g.id IS NULL OR g.closed_at IS NOT NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM public.shared_group_members WHERE group_id = g.id AND status IN ('accepted', 'pending');
  RETURN jsonb_build_object(
    'group_id', g.id,
    'name', g.name, 'start_date', g.start_date, 'end_date', g.end_date, 'split_mode', g.split_mode,
    'inviter', (SELECT coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Alguien')
                  FROM public.profiles p WHERE p.id = l.created_by),
    -- solo primeros nombres de quienes ya están; nunca ingresos ni montos
    'people', coalesce((
      SELECT jsonb_agg(coalesce(nullif(split_part(trim(CASE WHEN m.guest_name IS NOT NULL THEN m.guest_name ELSE p.display_name END), ' ', 1), ''), 'Alguien')
                       ORDER BY m.joined_at NULLS LAST)
        FROM public.shared_group_members m LEFT JOIN public.profiles p ON p.id = m.user_id
       WHERE m.group_id = g.id AND m.status = 'accepted'), '[]'::jsonb),
    'full', n >= 15
  );
END $$;

-- ── Unirse: la persona ya tiene sesión ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shared_join_link_accept(p_token text, p_category uuid, p_consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); l public.shared_group_share_links; g public.shared_groups; cur text; n int; e uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'link_invalid'; END IF;
  SELECT * INTO l FROM public.shared_group_share_links
   WHERE token_hash = public.shared__token_hash(p_token) AND kind = 'join' AND revoked_at IS NULL AND expires_at > now();
  IF l.id IS NULL THEN RAISE EXCEPTION 'link_invalid'; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = l.group_id;
  IF g.id IS NULL OR g.closed_at IS NOT NULL THEN RAISE EXCEPTION 'group_closed'; END IF;
  IF p_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category AND user_id = uid) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  SELECT status INTO cur FROM public.shared_group_members WHERE group_id = g.id AND user_id = uid;
  IF cur = 'accepted' THEN RETURN g.id; END IF;   -- ya estaba: no hace falta nada más

  SELECT count(*) INTO n FROM public.shared_group_members
   WHERE group_id = g.id AND status IN ('accepted', 'pending') AND user_id <> uid;
  IF n >= 15 THEN RAISE EXCEPTION 'group_full'; END IF;

  INSERT INTO public.shared_group_members (group_id, user_id, status, invited_by, joined_at, personal_category_id, income_consent)
  VALUES (g.id, uid, 'accepted', l.created_by, now(), p_category, coalesce(p_consent, false))
  ON CONFLICT (group_id, user_id) DO UPDATE
    SET status = 'accepted', joined_at = now(), personal_category_id = EXCLUDED.personal_category_id,
        income_consent = EXCLUDED.income_consent, merge_guest_id = NULL;

  PERFORM public.shared__recalc_group(g.id);
  FOR e IN SELECT id FROM public.shared_expenses WHERE group_id = g.id LOOP
    PERFORM public.shared__sync_personal(e);
  END LOOP;
  RETURN g.id;
END $$;

REVOKE ALL ON FUNCTION public.shared_join_link_create(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_join_link_revoke(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_join_link_accept(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_join_link_create(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_join_link_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_join_link_accept(text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_join_preview(text) TO anon, authenticated;
