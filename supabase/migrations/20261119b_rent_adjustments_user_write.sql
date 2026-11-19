-- Cas puede calcular un reajuste a mano desde la app (IPC escrito por ella),
-- además del cron (service_role). Necesita crear y reemplazar sus propias filas.
CREATE POLICY "rent_adjustments_insert_own" ON public.rent_adjustments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rent_adjustments_delete_own" ON public.rent_adjustments FOR DELETE USING (auth.uid() = user_id);
