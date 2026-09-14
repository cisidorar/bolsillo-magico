-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" al subir una boleta de gastos comunes (o luz/agua) que ya
-- no tiene un recordatorio estimado pendiente al que reemplazar.
--
-- saveUtilityBill (app/actions/property.ts) hace
--   supabase.from('property_charges').upsert(row, {
--     onConflict: 'user_id,property_id,kind,external_ref',
--   })
-- que Postgres traduce a ON CONFLICT (user_id, property_id, kind,
-- external_ref) DO UPDATE ... — sin ninguna cláusula WHERE. El único índice
-- único que cubre esas 4 columnas (property_charges_external_ref_uniq, de
-- 20260904_properties.sql) es PARCIAL: "WHERE external_ref IS NOT NULL".
-- Postgres solo usa un índice parcial como "arbiter" de un ON CONFLICT si la
-- sentencia repite el mismo WHERE en el propio ON CONFLICT — algo que el
-- upsert() de supabase-js no permite especificar. Sin ese WHERE, Postgres no
-- encuentra ningún candidato y tira el error de la cita.
--
-- El WHERE parcial era innecesario desde el principio: en Postgres cada NULL
-- ya se considera distinto de cualquier otro NULL bajo UNIQUE estándar (no
-- parcial), así que un índice único NO parcial sigue permitiendo tantas filas
-- con external_ref NULL como se quiera (arriendo sin folio, cobros manuales
-- sin N° de giro) — el comentario original en 20260904_properties.sql asumía
-- lo contrario. Se reemplaza el índice parcial por uno completo: mismo
-- comportamiento de datos, pero ahora sí sirve de arbiter para el upsert.

DROP INDEX IF EXISTS public.property_charges_external_ref_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS property_charges_external_ref_uniq
  ON public.property_charges(user_id, property_id, kind, external_ref);
