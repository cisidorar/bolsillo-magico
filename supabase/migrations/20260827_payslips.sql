-- Liquidaciones de sueldo (pedido de Cas, ago 2026): desglose completo extraído
-- de un PDF de liquidación (bruto, haberes, descuentos legales, líquido) más
-- metadata del empleador/cargo. El monto líquido se refleja también en
-- `incomes.amount` del mes correspondiente (una liquidación confirmada =
-- un ingreso registrado), pero el detalle vive acá para poder ver evolución
-- de renta bruta / descuentos en el tiempo y volver a descargar el PDF.
create table if not exists public.payslips (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  month                 integer not null check (month between 1 and 12),
  year                  integer not null check (year >= 2020),

  employer_name         text,
  employer_rut          text,
  employee_name         text,
  employee_rut          text,
  position              text,          -- Cargo
  contract_type         text,          -- Tipo Contrato
  contract_start        date,
  days_worked           integer,
  uf_value              numeric,
  prevision_label       text,          -- ej: "Uno (10.46%)"
  salud_label            text,          -- ej: "Colmena 3.246 UF (100.0%)"

  -- Desglose: arrays de { label: string, amount: number }
  haberes_imponibles    jsonb not null default '[]',
  haberes_no_imponibles jsonb not null default '[]',
  descuentos_legales    jsonb not null default '[]',
  otros_descuentos      jsonb not null default '[]',

  total_haberes         integer not null default 0,
  total_descuentos      integer not null default 0,
  liquido               integer not null default 0,

  pdf_path              text,          -- ruta en el bucket 'payslips': {user_id}/{year}-{month}.pdf

  created_at            timestamptz not null default now(),
  unique (user_id, month, year)
);

create index if not exists payslips_user_date_idx
  on public.payslips (user_id, year desc, month desc);

alter table public.payslips enable row level security;

create policy "manage own payslips"
  on public.payslips for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.payslips to authenticated;

-- ── Storage: bucket privado para los PDFs originales ──────────────────────
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;

create policy "payslips_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payslips'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "payslips_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payslips'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "payslips_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payslips'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
