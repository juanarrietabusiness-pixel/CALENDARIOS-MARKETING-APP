-- ============================================================
-- El estudio de mercado de cada cliente
--
-- Una fila por cliente con cuatro cosas, todas JSON:
--
--   catalogo     Sus productos y servicios con precio, oferta, para quién y
--                beneficios. Es la base de lo que se escribe y se pide al
--                Estudio: un precio no se inventa, sale de aquí.
--   estudio      El estudio de mercado APROBADO: lo general (rubro,
--                competencia, perfiles, deseos, nivel de consciencia) y uno
--                por producto (los siete elementos, objeciones, ganchos por
--                nivel, textos de anuncio).
--   borrador     El que se está haciendo o revisando: se escribe por pasos
--                —lo general y luego un producto por llamada— y no pisa el
--                aprobado hasta que una persona lo aprueba.
--   referencias  Los anuncios de la competencia que la agencia sube con su
--                análisis (la imagen vive en la galería del Estudio).
--
-- Va en su tabla y no en `clients` a propósito: el estudio pesa decenas de
-- miles de caracteres y `clients` viaja entero al navegador en cada carga y
-- en cada aviso de cambio. Lo puro vive en src/lib/estudioMercado.js; lo que
-- toca la base, la IA y Drive, en worker/lib/mercado.js.
-- ============================================================

pragma foreign_keys = on;

create table if not exists mercado_clientes (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  catalogo    text not null default '[]' check (json_valid(catalogo)),
  estudio     text check (estudio is null or json_valid(estudio)),
  borrador    text check (borrador is null or json_valid(borrador)),
  referencias text not null default '[]' check (json_valid(referencias)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists mercado_clientes_cliente on mercado_clientes(client_id);
create index if not exists mercado_clientes_dueno on mercado_clientes(owner_id);
