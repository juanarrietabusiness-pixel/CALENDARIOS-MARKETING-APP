-- ============================================================
-- Anuncios de Meta (Marketing API)
--
--   1. cuentas_anuncios: las cuentas publicitarias que ve el token de la
--      persona que conectó Meta (/me/adaccounts), y a qué cliente va cada
--      una. Igual que cuentas_sociales con las páginas, pero aparte: el
--      `check` de `red` de esa tabla no admite otra cosa, y cambiar un
--      check en SQLite es reconstruir la tabla (0022). `minimo_diario` es
--      el mínimo de la cuenta en unidades MENORES de su moneda.
--   2. campanas_anuncios: las campañas que se crearon DESDE LA APP —quién,
--      cuándo, para qué cliente, con qué borrador—. Todo se crea en pausa;
--      `activada_por` / `activada_at` dicen quién le dio al interruptor.
--      Las campañas creadas fuera (en el Administrador de anuncios) no
--      tienen fila: se leen de Meta y ya.
--   3. historial_anuncios: quién creó, activó o pausó qué. Una fila por
--      acción; nunca se reescribe.
--
-- Con dueño (el espacio) y cliente, y declaradas en worker/lib/acceso.js.
-- `cuenta_id` y `campana_id` son ids de Meta, no claves ajenas: la lista de
-- cuentas se vuelve a leer de Meta y una campaña borrada allí no puede
-- llevarse el historial.
-- ============================================================

pragma foreign_keys = on;

create table if not exists cuentas_anuncios (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  externo_id     text not null,
  nombre         text not null default '',
  moneda         text not null default 'USD',
  zona_horaria   text not null default '',
  estado         integer not null default 1,
  negocio        text not null default '',
  minimo_diario  integer,
  client_id      text references clients(id) on delete set null,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (owner_id, externo_id)
);
create index if not exists cuentas_anuncios_dueno on cuentas_anuncios(owner_id);
create index if not exists cuentas_anuncios_cliente on cuentas_anuncios(client_id);

create table if not exists campanas_anuncios (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  cuenta_id      text not null,
  campana_id     text not null,
  conjunto_id    text,
  creativo_id    text,
  anuncio_id     text,
  nombre         text not null default '',
  objetivo       text not null default '',
  presupuesto    text not null default '{}' check (json_valid(presupuesto)),
  inicio         text,
  fin            text,
  estado         text not null default 'PAUSED',
  borrador       text not null default '{}' check (json_valid(borrador)),
  creado_por     text,
  creado_nombre  text not null default '',
  activada_por   text,
  activada_at    text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (owner_id, campana_id)
);
create index if not exists campanas_anuncios_dueno on campanas_anuncios(owner_id);
create index if not exists campanas_anuncios_cliente on campanas_anuncios(client_id, created_at);

create table if not exists historial_anuncios (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  campana_id     text not null,
  accion         text not null check (accion in ('crear','activar','pausar')),
  usuario_id     text,
  nombre         text not null default '',
  detalle        text not null default '{}' check (json_valid(detalle)),
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists historial_anuncios_dueno on historial_anuncios(owner_id);
create index if not exists historial_anuncios_cliente on historial_anuncios(client_id, created_at);
create index if not exists historial_anuncios_campana on historial_anuncios(campana_id);
