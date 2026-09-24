-- ============================================================
-- La IA del espacio: qué modelo, cuánto razona y cuánto cuesta
--
--   1. `ia_modelo` e `ia_razonamiento` en ajustes_espacio. Una sola
--      configuración para toda la IA de texto, que cambia el
--      administrador. Por defecto, Sonnet 5 con razonamiento alto.
--   2. `consumo_ia`: un apunte por llamada a Anthropic, con sus tokens y
--      su costo en dólares calculado con la tarifa del modelo. Es lo que
--      alimenta el contador del mes: con él se decide el nivel de
--      razonamiento con datos, no con estimaciones.
-- ============================================================

pragma foreign_keys = on;

alter table ajustes_espacio add column ia_modelo text not null default 'sonnet'
  check (ia_modelo in ('sonnet','opus'));
alter table ajustes_espacio add column ia_razonamiento text not null default 'alto'
  check (ia_razonamiento in ('bajo','medio','alto','maximo'));

create table if not exists consumo_ia (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  mes           text not null,
  funcion       text not null default 'otro',
  modelo        text not null default '',
  entrada       integer not null default 0,
  salida        integer not null default 0,
  cache_leido   integer not null default 0,
  cache_escrito integer not null default 0,
  costo_usd     real not null default 0,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists consumo_ia_mes on consumo_ia(owner_id, mes);
