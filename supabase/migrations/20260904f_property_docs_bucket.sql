-- P3 (PLAN_PROPIEDAD): bucket privado para boletas de luz y agua.
--
-- Mismas políticas que `payslips`: el primer segmento de la ruta es el
-- user_id, y RLS lo compara contra auth.uid(). Ruta final:
--   {user_id}/{property_id}/{kind}-{year}-{month}.pdf
--
-- Guardamos siempre el PDF original aunque el parser haya extraído todo: si
-- mañana el parser mejora o Enel cambia el formato, se puede reprocesar.
-- Sin el original, un error de parseo sería irrecuperable.

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-docs', 'property-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "property_docs_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'property-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_docs_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property_docs_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
