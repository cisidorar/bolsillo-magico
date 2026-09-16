-- Cas (sep 2026): "me gustaria que cuando presiono salga el historial de los
-- anteriores ya que es renovable y no salga en vencidos" — un depósito
-- renovable que se renueva queda hoy como dos filas SUELTAS en term_deposits,
-- sin ningún vínculo entre el ciclo viejo y el nuevo. Efecto: el ciclo que ya
-- venció se sigue mostrando en "Vencidos" para siempre (aunque ya se haya
-- renovado) y no hay forma de ver el historial de ciclos anteriores desde el
-- detalle del ciclo activo.
--
-- renewed_from_id encadena un ciclo con el que lo originó — NULL en el primer
-- ciclo de un depósito. ON DELETE SET NULL: si se borra un ciclo viejo, el
-- que le sigue no debe desaparecer ni fallar, solo pierde el link hacia atrás.

alter table public.term_deposits
  add column renewed_from_id uuid references public.term_deposits(id) on delete set null;

create index if not exists term_deposits_renewed_from_id_idx on public.term_deposits(renewed_from_id);

-- Backfill del único par ya renovado hoy (ver conversación): el ciclo de
-- $335.000 (venció 8/9) se renovó al de $336.329 (vence 13/10).
update public.term_deposits
set renewed_from_id = 'f2d1d1e2-858d-4bdb-8ee0-cf0ff0ccabb0'
where id = '75e1b17b-b946-4463-a643-54f3e899a9f8';
