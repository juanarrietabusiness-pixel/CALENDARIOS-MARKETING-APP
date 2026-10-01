-- ============================================================
-- La bandeja: comentarios y mensajes de Facebook e Instagram
--
--   bandeja_clientes     El interruptor de cada cliente. Apagado (o sin
--                        fila) no se lee ni se guarda NADA de ese cliente:
--                        el webhook descarta lo que llega de sus cuentas y
--                        «Actualizar» no pregunta a Meta. `suscripcion`
--                        dice qué páginas quedaron suscritas a la app
--                        (`/{page-id}/subscribed_apps`) y, si Meta no
--                        aceptó, por qué.
--   bandeja_comentarios  Un comentario de una publicación, con la
--                        publicación a la que pertenece (texto, miniatura
--                        y enlace, que no cambian). `propio` = lo escribió
--                        la página o la cuenta (una respuesta de la
--                        agencia). `atendido` es de la agencia, no de Meta.
--   bandeja_hilos        Una conversación privada: la cuenta del cliente y
--                        UNA persona. `ultimo_usuario_at` es el último
--                        mensaje DE LA PERSONA: de él cuelga la ventana de
--                        24 horas en la que Meta deja responder.
--   bandeja_mensajes     Cada mensaje de un hilo.
--
-- Todas con dueño (el espacio) y cliente, declaradas en
-- worker/lib/acceso.js. El id de las filas que llegan de Meta es
-- «espacio:red:id de Meta»: el mismo comentario que llega dos veces (el
-- webhook y «Actualizar») es UNA fila.
-- ============================================================

pragma foreign_keys = on;

create table if not exists bandeja_clientes (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  activa         integer not null default 0 check (activa in (0,1)),
  suscripcion    text not null default '{}' check (json_valid(suscripcion)),
  actualizada_at text,
  activada_por   text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists bandeja_clientes_dueno on bandeja_clientes(owner_id);
create index if not exists bandeja_clientes_client_id on bandeja_clientes(client_id);

create table if not exists bandeja_comentarios (
  id                    text primary key,
  owner_id              text not null references users(id) on delete cascade,
  client_id             text not null references clients(id) on delete cascade,
  cuenta_id             text references cuentas_sociales(id) on delete set null,
  red                   text not null check (red in ('instagram','facebook')),
  externo_id            text not null,
  padre_id              text,
  publicacion_id        text not null default '',
  publicacion_texto     text not null default '',
  publicacion_miniatura text not null default '',
  publicacion_enlace    text not null default '',
  autor_id              text not null default '',
  autor                 text not null default '',
  texto                 text not null default '',
  propio                integer not null default 0 check (propio in (0,1)),
  oculto                integer not null default 0 check (oculto in (0,1)),
  atendido              integer not null default 0 check (atendido in (0,1)),
  respondido            integer not null default 0 check (respondido in (0,1)),
  creado_at             text not null,
  atendido_por          text,
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (owner_id, red, externo_id)
);
create index if not exists bandeja_comentarios_dueno on bandeja_comentarios(owner_id);
create index if not exists bandeja_comentarios_client_id on bandeja_comentarios(client_id, creado_at);
create index if not exists bandeja_comentarios_cuenta_id on bandeja_comentarios(cuenta_id);
create index if not exists bandeja_comentarios_publicacion on bandeja_comentarios(publicacion_id);

create table if not exists bandeja_hilos (
  id                text primary key,
  owner_id          text not null references users(id) on delete cascade,
  client_id         text not null references clients(id) on delete cascade,
  cuenta_id         text references cuentas_sociales(id) on delete set null,
  red               text not null check (red in ('instagram','facebook')),
  usuario_id        text not null,
  usuario           text not null default '',
  ultimo_texto      text not null default '',
  ultimo_at         text,
  ultimo_usuario_at text,
  sin_leer          integer not null default 0,
  atendido          integer not null default 0 check (atendido in (0,1)),
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists bandeja_hilos_dueno on bandeja_hilos(owner_id);
create index if not exists bandeja_hilos_client_id on bandeja_hilos(client_id, ultimo_at);
create index if not exists bandeja_hilos_cuenta_id on bandeja_hilos(cuenta_id);

create table if not exists bandeja_mensajes (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  client_id    text not null references clients(id) on delete cascade,
  hilo_id      text not null references bandeja_hilos(id) on delete cascade,
  red          text not null check (red in ('instagram','facebook')),
  externo_id   text not null,
  propio       integer not null default 0 check (propio in (0,1)),
  texto        text not null default '',
  adjuntos     text not null default '[]' check (json_valid(adjuntos)),
  enviado_at   text not null,
  enviado_por  text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists bandeja_mensajes_dueno on bandeja_mensajes(owner_id);
create index if not exists bandeja_mensajes_client_id on bandeja_mensajes(client_id);
create index if not exists bandeja_mensajes_hilo_id on bandeja_mensajes(hilo_id, enviado_at);
