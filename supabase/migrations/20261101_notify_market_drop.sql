-- Aviso de caída fuerte en la bolsa (nov 2026): correo con explicación e impacto
-- en tus finanzas los días que tu cartera o el mercado caen fuerte.
alter table public.profiles
  add column if not exists notify_market_drop boolean not null default true;
