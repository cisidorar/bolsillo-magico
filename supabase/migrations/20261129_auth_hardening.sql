-- Endurecimiento de funciones internas (nov 2026, revisión de seguridad del registro).
--
-- 1. rls_auto_enable() y handle_new_user() son funciones internas (un event trigger y el trigger de alta de
--    cuentas). Quedaron ejecutables por `anon` y `authenticated` vía /rest/v1/rpc. Los triggers siguen
--    funcionando: PostgreSQL revisa el permiso al crear el trigger, no al dispararlo.
--    seed_user_defaults(uuid) SÍ la llama la app con la sesión de la persona (/api/seed y /api/auth/callback),
--    así que `authenticated` se conserva; solo se le quita `anon` (sin sesión nadie debe poder invocarla).
--    Pendiente: que la función compare p_user_id con auth.uid() para que nadie siembre datos en otra cuenta.
-- 2. Dos funciones sin search_path fijo (aviso del linter de Supabase).

REVOKE ALL ON FUNCTION public.seed_user_defaults(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()        FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.guard_profile_privileged_columns() SET search_path = public;
ALTER FUNCTION public.shared__token_hash(text)           SET search_path = public;
