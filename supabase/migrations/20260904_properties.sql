-- ── P1 (PLAN_PROPIEDAD, sep 2026): la propiedad en arriendo como mundo aparte ──
-- Decisión D1 del plan: este módulo NO se relaciona con expenses, incomes,
-- análisis, presupuesto ni patrimonio. El arriendo entra y el dividendo sale
-- y se anulan entre sí — meter ambos al flujo personal agrega dos números
-- grandes que se cancelan y ensucia el análisis mensual sin responder nada.
-- Por eso: ninguna columna nueva en tablas existentes, ningún filtro nuevo en
-- vistas que ya funcionan. Este módulo se puede borrar entero sin dejar rastro.
--
-- La pregunta que responde no es "cuánto gano con el depto" (no se gana nada),
-- sino "¿está todo al día?".

-- ── La propiedad ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.properties (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias       text        NOT NULL,
  address     text,
  comuna      text,
  -- ROL de avalúo: la llave con la que se consultan aseo y contribuciones.
  rol_sii     text,

  -- Dividendo: se cobra automático a la cuenta corriente. Guardamos un RÓTULO
  -- de la cuenta, nunca el número — no hace falta para nada y es un dato que
  -- no conviene tener duplicado en la base.
  mortgage_amount        integer     CHECK (mortgage_amount > 0),
  mortgage_due_day       integer     CHECK (mortgage_due_day BETWEEN 1 AND 31),
  mortgage_account_label text,

  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own properties"
  ON public.properties
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS properties_user_id_idx ON public.properties(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;


-- ── El ledger de obligaciones ───────────────────────────────────────────────
-- El primitivo que la app no tenía: `expenses` solo sabe decir "pagué X el día
-- D". Acá una fila puede existir SIN estar pagada, con vencimiento propio, y
-- acumulando recargos. Eso es lo que permite responder "cuánta deuda llevo por
-- no haber pagado el aseo".
--
-- NO hay columna `status`. Se deriva de due_date + paid_date en
-- lib/property-charges.ts — misma lección que currentStatementRange vs
-- lastClosedStatementRange (ver CLAUDE.md): un estado guardado en la base
-- miente al día siguiente.
CREATE TABLE IF NOT EXISTS public.property_charges (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id   uuid        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  kind          text        NOT NULL CHECK (kind IN (
                              'rent', 'mortgage', 'electricity', 'water', 'gas',
                              'aseo', 'contribuciones', 'gastos_comunes',
                              'repair', 'deposit', 'other')),
  direction     text        NOT NULL CHECK (direction IN ('in', 'out')),

  period_month  integer     CHECK (period_month BETWEEN 1 AND 12),
  period_year   integer     CHECK (period_year >= 2020),
  due_date      date        NOT NULL,

  -- Tres montos separados porque el aseo llega con tres: base, interés penal y
  -- reajuste IPC. El total NO se almacena (amount + penalty + inflation_adj).
  amount        integer     NOT NULL CHECK (amount >= 0),
  penalty       integer     NOT NULL DEFAULT 0 CHECK (penalty >= 0),
  inflation_adj integer     NOT NULL DEFAULT 0 CHECK (inflation_adj >= 0),
  -- true cuando penalty/inflation_adj los calculó la app y no salen de un
  -- documento real. La UI los rotula como estimados: la cifra verdadera del
  -- aseo la pone TGR, no nosotros.
  arrears_estimated boolean NOT NULL DEFAULT false,

  paid_date     date,
  paid_amount   integer     CHECK (paid_amount >= 0),

  -- El dividendo se cobra solo: nace pagado pero sin confirmar, con un chip
  -- discreto hasta que lo revises. Al revés (darlo por impago) genera alertas
  -- falsas y se deja de mirar el módulo.
  auto_debit    boolean     NOT NULL DEFAULT false,
  confirmed     boolean     NOT NULL DEFAULT false,

  -- Por contrato, consumos y gastos comunes los paga el arrendatario. No son
  -- costo tuyo, pero su mora es causal de término y un salto de consumo en un
  -- depto donde no vives puede ser una filtración. Se listan, no se suman.
  responsible   text        NOT NULL DEFAULT 'owner'
                            CHECK (responsible IN ('owner', 'tenant')),

  -- Nro de giro / nro de boleta: llave natural de idempotencia, para que
  -- regenerar el año no duplique (mismo patrón que 20260717_auto_register_idempotent).
  external_ref  text,
  document_path text,
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own property_charges"
  ON public.property_charges
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS property_charges_user_due_idx
  ON public.property_charges(user_id, due_date DESC);
CREATE INDEX IF NOT EXISTS property_charges_property_idx
  ON public.property_charges(property_id, due_date DESC);

-- Idempotencia: un mismo giro/boleta no se puede cargar dos veces. Índice
-- parcial porque external_ref es null en cobros que no traen folio (arriendo,
-- dividendo) y ahí un UNIQUE normal bloquearía más de una fila null por tipo.
CREATE UNIQUE INDEX IF NOT EXISTS property_charges_external_ref_uniq
  ON public.property_charges(user_id, property_id, kind, external_ref)
  WHERE external_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_charges TO authenticated;
