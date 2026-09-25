-- ============================================================
-- Auditorías de perfil
--
-- Una revisión del perfil de Instagram de un cliente —o de un prospecto,
-- que todavía no es cliente y por eso `client_id` puede ir vacío—: foto,
-- nombre, biografía, enlace, destacados, rejilla y contenido, con las
-- prioridades. `datos` es la foto del perfil TAL COMO ESTABA al auditar
-- (congelada, como las cifras del informe); `analisis`, lo que escribe la
-- IA. `testigo` es el enlace público, sin sesión y de sólo lectura.
-- ============================================================

pragma foreign_keys = on;

create table if not exists auditorias (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text references clients(id) on delete set null,
  usuario       text not null,
  estado        text not null default 'generando' check (estado in ('generando','listo','error')),
  datos         text not null default '{}' check (json_valid(datos)),
  analisis      text not null default '{}' check (json_valid(analisis)),
  error         text,
  testigo       text unique,
  compartido    integer not null default 0 check (compartido in (0,1)),
  generado_por  text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists auditorias_dueno on auditorias(owner_id, created_at);
create index if not exists auditorias_cliente on auditorias(client_id);
