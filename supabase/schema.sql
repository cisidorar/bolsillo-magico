-- =============================================
-- GSTOS — Schema completo con Row Level Security
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- =============================================
-- TABLAS
-- =============================================

-- Categorías (predefinidas + personalizadas por usuario)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  icon        text not null,
  color       text not null,
  bg_color    text not null,
  is_default  boolean default false,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- Métodos de pago
create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  name         text not null,
  icon         text not null,
  card_type    text check (card_type in ('debit', 'credit', 'cash', 'digital')) default 'debit',
  billing_day  integer check (billing_day between 1 and 31),
  last_four    text,
  is_default   boolean default false,
  sort_order   integer default 0,
  domain       text,
  created_at   timestamptz default now()
);

-- Presupuestos mensuales
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      integer not null check (amount > 0),
  month       integer not null check (month between 1 and 12),
  year        integer not null check (year >= 2020),
  created_at  timestamptz default now(),
  unique(user_id, month, year)
);

-- Presupuestos por categoría
create table if not exists public.category_budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  category_id  uuid references public.categories(id) on delete cascade not null,
  amount       integer not null check (amount > 0),
  created_at   timestamptz default now(),
  unique(user_id, category_id)
);

-- Gastos recurrentes (suscripciones y cuotas)
create table if not exists public.recurring_expenses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  name                text not null,
  amount              integer not null check (amount > 0),
  category_id         uuid references public.categories(id) on delete set null,
  payment_method_id   uuid references public.payment_methods(id) on delete set null,
  billing_day         integer not null check (billing_day between 1 and 28),
  auto_register       boolean default false,
  is_active           boolean default true,
  notes               text,
  domain              text,
  total_installments  integer default null,   -- null = recurrente indefinido, N = cuotas fijas
  paid_installments   integer default 0,      -- cuántas cuotas se han pagado
  created_at          timestamptz default now()
);

-- Gastos
create table if not exists public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  amount                integer not null check (amount > 0),
  category_id           uuid references public.categories(id) on delete set null,
  payment_method_id     uuid references public.payment_methods(id) on delete set null,
  recurring_expense_id  uuid references public.recurring_expenses(id) on delete set null,
  description           text,
  date                  date not null default current_date,
  tags                  text[] default '{}',
  created_at            timestamptz default now()
);

-- Perfil de usuario (datos extra además de auth.users)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  currency      text default 'CLP',
  updated_at    timestamptz default now()
);

-- =============================================
-- ÍNDICES
-- =============================================
create index if not exists expenses_user_date      on public.expenses(user_id, date desc);
create index if not exists expenses_category        on public.expenses(category_id);
create index if not exists expenses_recurring       on public.expenses(recurring_expense_id) where recurring_expense_id is not null;
create index if not exists budgets_user_period      on public.budgets(user_id, year, month);
create index if not exists recurring_user_active    on public.recurring_expenses(user_id, is_active);
create index if not exists category_budgets_user    on public.category_budgets(user_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table public.categories         enable row level security;
alter table public.payment_methods    enable row level security;
alter table public.budgets            enable row level security;
alter table public.category_budgets   enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expenses           enable row level security;
alter table public.profiles           enable row level security;

-- Policies: cada usuario solo accede a sus propios datos
create policy "own_categories"         on public.categories         for all using (auth.uid() = user_id);
create policy "own_payment_methods"    on public.payment_methods    for all using (auth.uid() = user_id);
create policy "own_budgets"            on public.budgets            for all using (auth.uid() = user_id);
create policy "own_category_budgets"   on public.category_budgets   for all using (auth.uid() = user_id);
create policy "own_recurring_expenses" on public.recurring_expenses for all using (auth.uid() = user_id);
create policy "own_expenses"           on public.expenses           for all using (auth.uid() = user_id);
create policy "own_profile_select"     on public.profiles           for select using (auth.uid() = id);
create policy "own_profile_update"     on public.profiles           for update using (auth.uid() = id);
create policy "own_profile_insert"     on public.profiles           for insert with check (auth.uid() = id);

-- =============================================
-- TRIGGER: crear perfil automáticamente al registrarse
-- =============================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- DATOS INICIALES: función para crear categorías
-- al hacer el primer login
-- =============================================
create or replace function public.seed_user_defaults(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- Solo insertar si no tiene categorías aún
  if not exists (select 1 from public.categories where user_id = p_user_id) then
    insert into public.categories (user_id, name, icon, color, bg_color, is_default, sort_order) values
      (p_user_id, 'Comida',       'UtensilsCrossed', '#0F6E56', '#E1F5EE', true, 1),
      (p_user_id, 'Transporte',   'Car',             '#185FA5', '#E6F1FB', true, 2),
      (p_user_id, 'Hogar',        'Home',            '#854F0B', '#FAEEDA', true, 3),
      (p_user_id, 'Ocio',         'Gamepad2',        '#993556', '#FBEAF0', true, 4),
      (p_user_id, 'Salud',        'HeartPulse',      '#3B6D11', '#EAF3DE', true, 5),
      (p_user_id, 'Ropa',         'Shirt',           '#3C3489', '#EEEDFE', true, 6),
      (p_user_id, 'Educación',    'BookOpen',        '#A32D2D', '#FCEBEB', true, 7),
      (p_user_id, 'Mascotas',     'PawPrint',        '#854F0B', '#FAEEDA', true, 8),
      (p_user_id, 'Otros',        'MoreHorizontal',  '#5F5E5A', '#F1EFE8', true, 9);
  end if;
  -- Sin métodos de pago por defecto — el usuario los agrega manualmente
end;
$$;
