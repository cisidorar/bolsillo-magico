-- Reajuste semestral del arriendo por IPC (nov 2026, a pedido de Cas).
-- Una fila por reajuste de un contrato: la crea el cron cuando el IPC de la
-- ventana ya está publicado, guarda el cálculo, el PDF del aviso (Storage,
-- bucket property-docs) y cuándo se mandó el correo. `applied_at` lo marca la
-- app cuando Cas confirma y la renta del contrato se actualiza.

CREATE TABLE IF NOT EXISTS public.rent_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lease_id         uuid NOT NULL REFERENCES public.lease_contracts(id) ON DELETE CASCADE,
  adjustment_month date NOT NULL,              -- YYYY-MM-01: desde este mes rige la renta nueva
  previous_rent    integer NOT NULL,
  new_rent         integer NOT NULL,
  cumulative_pct   numeric NOT NULL,           -- IPC acumulado compuesto, en %
  floored          boolean NOT NULL DEFAULT false,
  window_months    jsonb NOT NULL,             -- [{date:'2026-05-01', pct:0.3}, ...]
  pdf_path         text,
  notified_at      timestamptz,
  applied_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lease_id, adjustment_month)
);

ALTER TABLE public.rent_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rent_adjustments_select_own" ON public.rent_adjustments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rent_adjustments_update_own" ON public.rent_adjustments
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.rent_adjustments TO service_role;

-- Storage: el cron (service_role) escribe el PDF; Cas lo lee con su sesión
-- (la política property_docs_select_own ya exige {user_id}/... en la ruta).
