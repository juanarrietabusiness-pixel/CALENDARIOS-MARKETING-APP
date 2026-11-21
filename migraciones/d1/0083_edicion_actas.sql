-- ============================================================
-- EL EDITOR DE VIDEO GRABADO: las ACTAS de cada edición y las PROPUESTAS de lo que aprende
--
-- Al terminar una edición, quien edita (Claude en claude.ai, con acta_de_edicion) guarda el ACTA: qué se hizo y con qué
-- (el tipo de video, el estilo, la versión del kit y del manual, las medidas) y las correcciones de la persona tal cual.
-- De cada corrección sale, si pasa las guardas (src/lib/aprendizajeEdicion.js), una PROPUESTA: GENERAL (va al manual del
-- editor: `client_id` nulo, `destino` manual) o DE LA MARCA (va a un estilo de edición del cliente: `destino` estilo).
-- Ninguna se aplica sola: espera el «sí» de una persona (`estado`: pendiente → aplicada, descartada o caducada).
--
-- Las dos tienen dueño y cliente: la capa de acceso (worker/lib/acceso.js) las acota por los dos, así que una propuesta
-- general (sin cliente) no la ve un colaborador.
-- ============================================================

create table if not exists edicion_actas (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  archivo_id     text,
  tipo           text not null,
  estilo_id      text not null default '',
  kit_version    text not null default '',
  manual_version integer,
  resumen        text not null default '{}' check (json_valid(resumen)),
  correcciones   text not null default '[]' check (json_valid(correcciones)),
  por            text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists edicion_actas_cliente on edicion_actas(client_id, created_at);
create index if not exists edicion_actas_dueno on edicion_actas(owner_id);

create table if not exists edicion_propuestas (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  client_id    text references clients(id) on delete cascade,
  acta_id      text not null references edicion_actas(id) on delete cascade,
  destino      text not null check (destino in ('manual', 'estilo')),
  parte        text not null,
  estilo_id    text not null default '',
  operacion    text not null check (operacion in ('anadir', 'cambiar', 'quitar')),
  antes        text not null default '',
  texto        text not null default '',
  cita         text not null,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'descartada', 'caducada')),
  motivo       text not null default '',
  resuelta_por text,
  resuelta_at  text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists edicion_propuestas_estado on edicion_propuestas(owner_id, estado, destino);
create index if not exists edicion_propuestas_acta on edicion_propuestas(acta_id);
create index if not exists edicion_propuestas_cliente on edicion_propuestas(client_id);
