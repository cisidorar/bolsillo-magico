-- ── Depósitos a plazo: tipo Fijo/Renovable + más precisión en la tasa ────────
-- A pedido de Cas, el formulario de "Nuevo depósito a plazo" ahora deja
-- elegir Fijo/Renovable como campo propio en vez de perderse como texto
-- libre en `notes` ("renovable", "tasa fija") — ver components/
-- TermDepositManager.tsx.
--
-- De paso: `interest_rate` era numeric(5,2), o sea máximo 2 decimales. La
-- "Tasa Período" real de un depósito corto (ej. 35 días) suele tener más
-- precisión (0,39667%) — con 2 decimales se redondeaba a 0,40%, perdiendo
-- exactitud en el cálculo de ganancia (detectado revisando con Cas un
-- depósito real de Banco de Chile).

alter table public.term_deposits
  add column if not exists renewable boolean not null default false;

alter table public.term_deposits
  alter column interest_rate type numeric(8,5);
