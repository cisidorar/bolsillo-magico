-- Fix: sum(bigint) devuelve numeric y la división dejaba de ser entera (partes sumaban de más/menos).
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
