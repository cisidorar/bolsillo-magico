-- Ojo de privacidad en "Mis acciones" (sep 2026, Cas): al presionarlo se
-- ocultan los montos del hero de portafolio (valor total, invertido,
-- retorno total, billetera), y se recuerda entre sesiones.
alter table profiles
  add column if not exists hide_portfolio_amounts boolean not null default false;

comment on column profiles.hide_portfolio_amounts is
  'Ojo de privacidad en Mis acciones (sep 2026): oculta los montos del hero de portafolio, persistido entre sesiones.';
