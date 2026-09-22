-- ============================================================
-- Generación de imágenes con IA
--
--   1. `visual_style` en clients: guía visual editable que el
--      usuario va refinando, NO branding automático.
--   2. `image_templates`: plantillas visuales reutilizables por
--      cliente (ej: «post promocional», «tip educativo»).
--   3. `image_references`: imágenes de referencia por cliente.
--      Las que vienen de «me gusta» se marcan como 'liked'.
-- ============================================================

pragma foreign_keys = on;

alter table clients add column visual_style text not null default '';

create table if not exists image_templates (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  owner_id    text not null references users(id) on delete cascade,
  name        text not null,
  prompt      text not null default '',
  format      text not null default 'square',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists image_templates_client on image_templates(client_id);
create index if not exists image_templates_owner_id on image_templates(owner_id);

create table if not exists image_references (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  owner_id    text not null references users(id) on delete cascade,
  file_path   text not null,
  source      text not null default 'upload',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists image_references_client on image_references(client_id);
create index if not exists image_references_owner_id on image_references(owner_id);
