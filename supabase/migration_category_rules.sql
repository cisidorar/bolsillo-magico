-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla category_rules
-- Almacena reglas aprendidas para sugerir categorías al crear gastos.
-- Corre esto en Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.category_rules (
  id           uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key text       NOT NULL,  -- descripción normalizada (minúscula, sin tildes, sin puntuación)
  category_id  uuid       NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  confidence   smallint   NOT NULL DEFAULT 90 CHECK (confidence BETWEEN 0 AND 100),
  source       text       NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'history', 'ai')),
  hit_count    integer    NOT NULL DEFAULT 1,
  embedding    float8[]   NULL,       -- vector 1536 dims (text-embedding-3-small). NULL si no hay API key.
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key)
);

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their category rules"
  ON public.category_rules
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_category_rules_user
  ON public.category_rules (user_id);
