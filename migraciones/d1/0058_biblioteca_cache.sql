-- ============================================================
-- La caché de la Biblioteca de anuncios por Scrape Creators
--
-- Cada pedido a Scrape Creators gasta un crédito. La misma búsqueda (empresa,
-- filtros, página) en las próximas horas se contesta desde aquí sin pagar
-- otra vez (worker/lib/scrapeCreators.js). `id` = espacio + huella de la
-- consulta; `respuesta`, lo que contestó la API (reducida con `trim`).
-- Es del espacio, no de un cliente: la misma competencia la miran varios.
-- ============================================================

pragma foreign_keys = on;

create table if not exists biblioteca_cache (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  ruta        text not null,
  respuesta   text not null check (json_valid(respuesta)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists biblioteca_cache_dueno on biblioteca_cache(owner_id, created_at);
