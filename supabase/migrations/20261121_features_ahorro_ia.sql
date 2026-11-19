-- Dos módulos nuevos en profiles.features:
--   ahorro: Ahorro y depósitos (antes iba pegado a "inversiones")
--   ia:     Resumen con IA (cada análisis tiene costo para la dueña de la app)
-- Las cuentas que ya existen conservan lo que veían: ahorro sigue a inversiones,
-- e ia queda encendido. Las cuentas nuevas parten con ambos apagados.
update public.profiles
   set features = features
     || jsonb_build_object(
          'ahorro', coalesce((features->>'inversiones')::boolean, false),
          'ia', true)
 where not (features ? 'ahorro');
