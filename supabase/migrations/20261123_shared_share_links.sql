-- Enlace de solo lectura de un viaje (nov 2026, docs/PLAN_VIAJE_CON_INVITADA.md, fase 2).
-- Quien creó el viaje genera un enlace para quien no tiene cuenta. El token se
-- muestra una sola vez y en la base solo queda su hash. Se puede revocar y vence
-- a los 90 días. La función pública devuelve el viaje SIN ingresos de nadie:
-- solo el porcentaje de cada persona.

CREATE TABLE IF NOT EXISTS public.shared_group_share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS shared_links_group_idx ON public.shared_group_share_links (group_id);

ALTER TABLE public.shared_group_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator reads links" ON public.shared_group_share_links;
CREATE POLICY "creator reads links" ON public.shared_group_share_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.shared_groups g WHERE g.id = group_id AND g.created_by = auth.uid()));
-- Sin políticas de escritura: todo pasa por las funciones de abajo.
GRANT SELECT ON public.shared_group_share_links TO authenticated;

CREATE OR REPLACE FUNCTION public.shared__token_hash(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Crea un enlace nuevo (revoca el anterior) y devuelve el token en claro, una sola vez.
CREATE OR REPLACE FUNCTION public.shared_link_create(p_group uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.shared_groups; tok text;
BEGIN
  SELECT * INTO g FROM public.shared_groups WHERE id = p_group;
  IF g.id IS NULL OR g.created_by <> auth.uid() THEN RAISE EXCEPTION 'only_creator'; END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.shared_group_share_links (group_id, token_hash, created_by, expires_at)
  VALUES (p_group, public.shared__token_hash(tok), auth.uid(), now() + interval '90 days');
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.shared_link_revoke(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shared_groups WHERE id = p_group AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'only_creator';
  END IF;
  UPDATE public.shared_group_share_links SET revoked_at = now()
   WHERE group_id = p_group AND revoked_at IS NULL;
END $$;

-- Lectura pública por token. Devuelve null si el enlace no existe, venció o se revocó.
CREATE OR REPLACE FUNCTION public.shared_link_view(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.shared_group_share_links; g public.shared_groups; res jsonb; wts jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.shared_group_share_links
   WHERE token_hash = public.shared__token_hash(p_token) AND revoked_at IS NULL AND expires_at > now();
  IF l.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO g FROM public.shared_groups WHERE id = l.group_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;

  BEGIN
    SELECT coalesce(jsonb_object_agg(w.user_id::text, w.w), '{}'::jsonb) INTO wts
    FROM public.shared__member_weights(g.id) w;
  EXCEPTION WHEN OTHERS THEN
    wts := '{}'::jsonb;
  END;

  SELECT jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'start_date', g.start_date, 'end_date', g.end_date,
                                'closed_at', g.closed_at, 'split_mode', g.split_mode),
    'expires_at', l.expires_at,
    'weights', wts,
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.user_id,
        'name', CASE WHEN m.guest_name IS NOT NULL THEN m.guest_name
                     ELSE coalesce(nullif(trim(p.display_name), ''), 'Alguien') END,
        'is_guest', m.guest_name IS NOT NULL) ORDER BY m.joined_at NULLS LAST, m.user_id)
      FROM public.shared_group_members m LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.group_id = g.id AND m.status = 'accepted'), '[]'::jsonb),
    'expenses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'description', e.description, 'date', e.date, 'amount', e.amount,
        'paid_by', e.paid_by, 'trip_category', e.trip_category,
        'shares', coalesce((SELECT jsonb_object_agg(s.user_id::text, s.share)
                            FROM public.shared_expense_shares s WHERE s.expense_id = e.id), '{}'::jsonb))
        ORDER BY e.date DESC, e.created_at DESC)
      FROM public.shared_expenses e WHERE e.group_id = g.id), '[]'::jsonb),
    'settlements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('from_user', t.from_user, 'to_user', t.to_user,
                                          'amount', t.amount, 'date', t.date) ORDER BY t.date DESC)
      FROM public.shared_settlements t WHERE t.group_id = g.id), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.shared_link_create(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shared_link_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_link_create(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_link_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shared_link_view(text) TO anon, authenticated;
