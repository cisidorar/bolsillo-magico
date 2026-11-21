-- Fotos de perfil prediseñadas (nov 2026): ya no se sube foto propia, se elige una de
-- /public/avatars (profiles.avatar_url guarda la ruta, ej. '/avatars/gato.svg').
-- Se quitan los permisos de subida al bucket `avatars`; la lectura y el borrado de las
-- fotos antiguas siguen funcionando.
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
