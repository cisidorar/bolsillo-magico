-- P2 (PLAN_PROPIEDAD): el contrato de arriendo.
--
-- Por qué tabla propia y no columnas en `properties`: una propiedad sobrevive
-- a sus contratos. Cuando Bruno se vaya y entre otro arrendatario, el contrato
-- viejo se marca is_active=false y se crea uno nuevo — la propiedad, sus
-- cobros históricos y su ROL siguen intactos. Meter renta y arrendatario en
-- `properties` obligaría a pisar los datos del contrato anterior.
--
-- Mundo aparte (D1): esto no toca expenses, incomes ni recurring_expenses.

CREATE TABLE IF NOT EXISTS public.lease_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  tenant_name   text NOT NULL,
  tenant_email  text,
  tenant_phone  text,

  start_date    date NOT NULL,
  end_date      date,                      -- null = indefinido
  notice_days   integer NOT NULL DEFAULT 60,

  rent_amount   integer NOT NULL CHECK (rent_amount > 0),
  -- Tope 28 por la misma razón que recurring_expenses.billing_day: un día 30
  -- no existe en febrero. El desplazamiento a fin de mes se resuelve en el
  -- cliente con effectiveDay(), no guardando un día imposible.
  rent_due_day  integer NOT NULL CHECK (rent_due_day BETWEEN 1 AND 28),

  late_fee_per_day   integer CHECK (late_fee_per_day >= 0),
  termination_days   integer,              -- días de mora que dan derecho a término
  collection_fee_pct numeric,              -- honorario de cobranza prejudicial

  adjustment_kind      text NOT NULL DEFAULT 'none'
                       CHECK (adjustment_kind IN ('ipc','uf','none')),
  adjustment_months    integer CHECK (adjustment_months > 0),
  last_adjustment_date date,

  deposit_amount       integer CHECK (deposit_amount >= 0),

  pays_utilities      text NOT NULL DEFAULT 'tenant' CHECK (pays_utilities IN ('owner','tenant')),
  pays_gastos_comunes text NOT NULL DEFAULT 'tenant' CHECK (pays_gastos_comunes IN ('owner','tenant')),

  document_path text,                      -- PDF notariado en Storage
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lease_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_contracts_select_own" ON public.lease_contracts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "lease_contracts_insert_own" ON public.lease_contracts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lease_contracts_update_own" ON public.lease_contracts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "lease_contracts_delete_own" ON public.lease_contracts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lease_contracts_property_idx
  ON public.lease_contracts(user_id, property_id) WHERE is_active;
