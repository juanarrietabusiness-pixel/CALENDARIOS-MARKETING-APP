-- ============================================================
-- Las conversaciones del asistente, por tema
--
-- Había UN hilo por cliente: o se arrastraba todo, o se borraba todo. Ahora
-- cada cliente tiene su lista de conversaciones («Guiones de reels»,
-- «Campaña de diciembre»…), y el asistente general también: las ve todo el
-- equipo, como antes el hilo de cada cliente.
--
--   1. chat_conversaciones: id, el cliente (VACÍO para el asistente
--      general), el título y quién la empezó.
--   2. chat_messages y chat_resumenes llevan su conversación, y el cliente
--      deja de ser obligatorio (el asistente general no tiene). Un NOT NULL
--      no se quita en SQLite: se reconstruyen las dos tablas, como 0040. No
--      tienen hijas, así que soltarlas no dispara ninguna cascada.
--   3. Lo que ya había en cada cliente pasa a una primera conversación,
--      «Conversación anterior», sin perder un mensaje; su resumen, con ella.
--      El id es fijo («anterior-<cliente>») para que reaplicar no duplique.
-- ============================================================

pragma foreign_keys = on;

create table if not exists chat_conversaciones (
  id          text primary key,
  owner_id    text not null references users(id)   on delete cascade,
  client_id   text references clients(id)          on delete cascade,
  titulo      text not null default '',
  creada_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists chat_conversaciones_lista on chat_conversaciones(owner_id, client_id, updated_at);
create index if not exists chat_conversaciones_cliente on chat_conversaciones(client_id);

insert or ignore into chat_conversaciones (id, owner_id, client_id, titulo, created_at, updated_at)
  select 'anterior-' || client_id, owner_id, client_id, 'Conversación anterior', min(created_at), max(created_at)
  from chat_messages group by owner_id, client_id;

create table if not exists chat_messages_v2 (
  id               text primary key,
  client_id        text references clients(id) on delete cascade,
  owner_id         text not null references users(id) on delete cascade,
  conversacion_id  text references chat_conversaciones(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Los índices se crean ya en la tabla nueva: al renombrarla se quedan con ella (los de la vieja se van con la vieja).
create index if not exists chat_messages_v2_cliente on chat_messages_v2(client_id, created_at);
create index if not exists chat_messages_v2_dueno on chat_messages_v2(owner_id);
create index if not exists chat_messages_v2_conversacion on chat_messages_v2(conversacion_id, created_at);
insert or ignore into chat_messages_v2 (id, client_id, owner_id, conversacion_id, role, content, created_at)
  select id, client_id, owner_id, 'anterior-' || client_id, role, content, created_at from chat_messages;

create table if not exists chat_resumenes_v2 (
  id               text primary key,
  client_id        text references clients(id) on delete cascade,
  owner_id         text not null references users(id) on delete cascade,
  conversacion_id  text references chat_conversaciones(id) on delete cascade,
  content          text not null default '',
  hasta            text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists chat_resumenes_v2_cliente on chat_resumenes_v2(client_id);
create index if not exists chat_resumenes_v2_dueno on chat_resumenes_v2(owner_id);
create index if not exists chat_resumenes_v2_conversacion on chat_resumenes_v2(conversacion_id);
-- El resumen de antes tenía de id el del cliente; ahora es el de su conversación. Sólo los de clientes con
-- conversación (con mensajes): uno sin mensajes resumía algo que ya no está.
insert or ignore into chat_resumenes_v2 (id, client_id, owner_id, conversacion_id, content, hasta, created_at, updated_at)
  select 'anterior-' || r.client_id, r.client_id, r.owner_id, 'anterior-' || r.client_id, r.content, r.hasta, r.created_at, r.updated_at
  from chat_resumenes r where exists (select 1 from chat_conversaciones c where c.id = 'anterior-' || r.client_id);

-- Se sueltan las viejas: todas sus filas acaban de copiarse arriba, y las nuevas ocupan su nombre.
drop table chat_messages;
alter table chat_messages_v2 rename to chat_messages;
drop table chat_resumenes;
alter table chat_resumenes_v2 rename to chat_resumenes;

