-- =============================================
-- Fix: eliminar categorías duplicadas y
--      actualizar seed_user_defaults para no crear
--      métodos de pago por defecto
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================

-- 1. Eliminar categorías duplicadas
--    Conserva la más antigua (menor created_at) por (user_id, name)
DELETE FROM public.categories
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, name) id
  FROM public.categories
  ORDER BY user_id, name, created_at ASC
);

-- 2. Actualizar RPC para NO crear métodos de pago
CREATE OR REPLACE FUNCTION public.seed_user_defaults(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Solo insertar si el usuario no tiene categorías aún
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id) THEN
    INSERT INTO public.categories (user_id, name, icon, color, bg_color, is_default, sort_order) VALUES
      (p_user_id, 'Comida',       'UtensilsCrossed', '#0F6E56', '#E1F5EE', true, 1),
      (p_user_id, 'Transporte',   'Car',             '#185FA5', '#E6F1FB', true, 2),
      (p_user_id, 'Hogar',        'Home',            '#854F0B', '#FAEEDA', true, 3),
      (p_user_id, 'Ocio',         'Gamepad2',        '#993556', '#FBEAF0', true, 4),
      (p_user_id, 'Salud',        'HeartPulse',      '#3B6D11', '#EAF3DE', true, 5),
      (p_user_id, 'Ropa',         'Shirt',           '#3C3489', '#EEEDFE', true, 6),
      (p_user_id, 'Educación',    'BookOpen',        '#A32D2D', '#FCEBEB', true, 7),
      (p_user_id, 'Mascotas',     'PawPrint',        '#854F0B', '#FAEEDA', true, 8),
      (p_user_id, 'Otros',        'MoreHorizontal',  '#5F5E5A', '#F1EFE8', true, 9);
  END IF;
  -- Sin métodos de pago por defecto — el usuario los agrega manualmente
END;
$$;
