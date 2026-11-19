-- Acceso por invitación (nov 2026).
-- La app sigue con el registro cerrado; las personas piden acceso en la lista
-- de espera y se les invita desde /admin. Esta migración prepara una cuenta
-- nueva para que funcione bien y para que nadie se auto-promueva.
--
--  1. profiles.features: qué módulos ve cada persona. Las cuentas que ya
--     existen quedan con todo encendido; las nuevas parten solo con lo básico
--     (Inversiones, Propiedad y lector de liquidaciones apagados).
--  2. profiles.is_admin: quién puede entrar a /admin. Ni is_admin ni features
--     se pueden cambiar desde el navegador (trigger más abajo).
--  3. Correos automáticos: las cuentas nuevas parten SIN avisos por correo.
--  4. handle_new_user también crea las categorías por defecto.
--  5. waitlist: estado de cada solicitud.

-- ── 1 y 2. profiles ─────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists features jsonb not null
    default '{"inversiones": false, "propiedad": false, "liquidaciones": false}'::jsonb,
  add column if not exists is_admin boolean not null default false;

-- Las cuentas que ya existen conservan todo lo que ven hoy.
update public.profiles
   set features = '{"inversiones": true, "propiedad": true, "liquidaciones": true}'::jsonb
 where features = '{"inversiones": false, "propiedad": false, "liquidaciones": false}'::jsonb;

-- La dueña de la app es admin. (Si el correo no existe todavía, no pasa nada.)
update public.profiles
   set is_admin = true
 where id in (select id from auth.users where lower(email) = 'cisidorar@gmail.com');

-- El update de perfil es libre para la propia persona (own_profile_update).
-- Sin esto, cualquiera podría ponerse is_admin = true o encender módulos desde
-- la consola del navegador con su propia sesión. Solo el service role (el
-- panel /admin) o el SQL Editor pueden tocar estas dos columnas.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.is_admin is true
         or new.features is distinct from '{"inversiones": false, "propiedad": false, "liquidaciones": false}'::jsonb then
        raise exception 'campo protegido' using errcode = '42501';
      end if;
    elsif new.is_admin is distinct from old.is_admin
       or new.features is distinct from old.features then
      raise exception 'campo protegido' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ── 3. Correos apagados por defecto en cuentas nuevas ───────────────────────
-- Solo cambia el valor por defecto de filas futuras: las cuentas existentes no
-- se tocan. Cada columna se revisa antes por si alguna no existe en tu base.
do $$
declare c text;
begin
  foreach c in array array[
    'notify_billing', 'notify_budget', 'notify_monthly', 'notify_recurring',
    'notify_watchlist_target', 'notify_weekly_report', 'notify_deposit_maturity',
    'notify_market_drop', 'notify_fomc'
  ] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
      execute format('alter table public.profiles alter column %I set default false', c);
    end if;
  end loop;
end $$;

-- ── 4. Una cuenta nueva ya trae sus categorías ──────────────────────────────
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
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

-- ── 5. Solicitudes de la lista de espera ────────────────────────────────────
alter table public.waitlist
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'invited', 'rejected')),
  add column if not exists invited_at timestamptz,
  add column if not exists invited_user_id uuid references auth.users(id) on delete set null;
