-- El cron de reajuste (service_role) y la UI (authenticated) no tenían permisos
-- de tabla: el cron fallaba con "permission denied for table lease_contracts".
GRANT SELECT, UPDATE ON public.lease_contracts   TO service_role;
GRANT SELECT         ON public.properties        TO service_role;
GRANT SELECT, UPDATE ON public.property_charges  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rent_adjustments TO authenticated;
