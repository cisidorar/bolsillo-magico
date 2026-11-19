-- El panel /admin usa la llave de servicio (service_role) y no tenía permisos de
-- tabla: leer la lista de espera, cambiar su estado y editar módulos de perfiles.
GRANT SELECT, INSERT, UPDATE ON public.waitlist TO service_role;
GRANT UPDATE ON public.profiles TO service_role;
