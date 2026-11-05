-- ============================================================
-- Las recetas de la agencia y los pedidos de «Crear con Claude»
--
-- Una receta es el CÓMO de una pieza (src/lib/recetas.js): un método escrito que lee quien diseña. Las de la casa
-- viven en el código; aquí sólo lo que la agencia CAMBIA o crea. Una fila con el `receta_id` de una de la casa la
-- sustituye (o la oculta, con `oculta` en sus datos); borrarla la restaura.
--
--   recetas.receta_id  El id («foto-heroe», «r-mi-receta»). Único por espacio.
--   recetas.datos      { titulo, descripcion, salida, tipos, preguntas, controles, instrucciones, oculta? }
--
-- Un HANDOFF es el pedido que viaja con «Crear con Claude»: la receta, el cliente y lo que se pidió (la publicación,
-- las referencias de la galería, la indicación). claude.ai sólo recibe su id en un mensaje corto y lo canjea por el
-- conector (herramienta `receta`). Caduca en un día (`expira_at`); es del espacio de quien lo pidió.
-- ============================================================

pragma foreign_keys = on;

create table if not exists recetas (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  receta_id   text not null check (length(receta_id) between 2 and 60),
  datos       text not null default '{}' check (json_valid(datos)),
  creado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists recetas_unica on recetas(owner_id, receta_id);

create table if not exists handoffs (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text references clients(id) on delete cascade,
  receta_id   text not null check (length(receta_id) between 2 and 60),
  datos       text not null default '{}' check (json_valid(datos)),
  creado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expira_at   text not null
);
create index if not exists handoffs_por_espacio on handoffs(owner_id, created_at);
create index if not exists handoffs_client_id on handoffs(client_id);
