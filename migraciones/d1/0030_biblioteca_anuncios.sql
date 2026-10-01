-- ============================================================
-- Biblioteca de anuncios de Meta: los filtros guardados
--
-- Una búsqueda en la Ad Library (`/ads_archive`) que se quiere repetir:
-- la competencia de un cliente, un tema, unas páginas. `consulta` es la
-- consulta ya normalizada por src/lib/biblioteca.js (palabras, páginas,
-- países, estado, fechas, tipo, plataformas, idiomas). `client_id` es
-- opcional: una búsqueda puede ser de la agencia y no de un cliente —y
-- entonces un colaborador no la ve, como una auditoría de un prospecto—.
--
-- Los anuncios NO se guardan: son de Meta, cambian cada día y se vuelven
-- a pedir al relanzar el filtro.
-- ============================================================

pragma foreign_keys = on;

create table if not exists biblioteca_filtros (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text references clients(id) on delete set null,
  nombre      text not null check (length(nombre) between 1 and 120),
  consulta    text not null default '{}' check (json_valid(consulta)),
  creado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists biblioteca_filtros_dueno on biblioteca_filtros(owner_id, created_at);
create index if not exists biblioteca_filtros_cliente on biblioteca_filtros(client_id);
