-- Lista de espera de la landing pública (nov 2026).
-- La app sigue con el registro cerrado; la landing vuelve a ser pública y
-- recoge correos de quienes quieren usarla cuando abra.
--
-- Nadie puede leer la tabla desde el cliente (RLS sin políticas de SELECT).
-- La única escritura es join_waitlist(), SECURITY DEFINER: valida el correo y
-- hace "on conflict do nothing", así un correo repetido no se distingue de uno
-- nuevo (no permite averiguar quién ya está en la lista).

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_lower_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

create or replace function public.join_waitlist(p_email text, p_source text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  insert into public.waitlist (email, source)
  values (v_email, left(p_source, 40))
  on conflict ((lower(email))) do nothing;
end;
$$;

revoke all on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
