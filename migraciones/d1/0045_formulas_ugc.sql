-- ============================================================
-- Las fórmulas UGC de la agencia
--
-- Una fórmula es la RECETA de un video que funciona, sin su contenido: los
-- tramos con su tiempo y qué hace cada uno (gancho, problema, demostración,
-- prueba, llamado…), qué tipo de gancho usa, por qué funciona y cuándo
-- conviene. Sale casi siempre de «Extraer guion y adaptar» (un video de la
-- competencia o de referencia) y sirve para TODOS los clientes: la voz de
-- cada uno va aparte, en su cerebro («Voz UGC»).
--
--   · `datos` es la fórmula tal cual la usa la pantalla (src/lib/formulasUgc.js).
--   · Es de la agencia, no de un cliente: no lleva `client_id`.
-- ============================================================

pragma foreign_keys = on;

create table if not exists formulas_ugc (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  datos       text not null default '{}' check (json_valid(datos)),
  creada_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists formulas_ugc_lista on formulas_ugc(owner_id, created_at);
