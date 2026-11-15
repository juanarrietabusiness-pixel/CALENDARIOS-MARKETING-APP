-- ============================================================
-- QUE NADA FALLE EN SILENCIO: la salud del cron y de las integraciones, los avisos que se dan una sola vez y el
-- teléfono (Web Push)
--
-- 1. `salud`: una fila por TAREA del cron («tarea:cola», «tarea:metricas»…), por PROVEEDOR con la llave del servidor
--    («proveedor:kie», «proveedor:anthropic»…) y por INTEGRACIÓN con el token de un espacio («<espacio>|drive»): el
--    último éxito, el último error con su texto y, en las tareas, cuántos fallos seguidos, desde cuándo y hasta cuándo se
--    salta (worker/lib/salud.js). Las tareas y los proveedores son de TODO el servidor (el cron recorre todos los espacios
--    y la llave es una): por eso la fila no tiene `owner_id`, sino `espacio` ('' = del servidor). Se lee y se escribe sólo
--    por las funciones de worker/lib/acceso.js que lo dicen (`leerSalud`, `guardarSalud`), que piden el espacio.
--    Se escribe BARATO: sólo cuando algo cambia de estado o, si sigue igual, cada pocos minutos.
-- 2. `avisos_dados`: lo que ya se avisó una vez («saldo:kie:2026-11-15», «limite:<calendario>:<fecha>», «tarea:<id>:<desde>»),
--    por espacio. Insertar la clave es la condición del aviso: si ya estaba, no se repite.
-- 3. `push_suscripciones`: cada dispositivo de cada persona que quiere los avisos importantes en el teléfono
--    (worker/lib/push.js). `id` = la huella de su dirección (`endpoint`): suscribirse dos veces es la misma fila. Una que
--    el servicio de push contesta 404/410 se borra.
-- ============================================================

create table if not exists salud (
  id            text primary key,
  espacio       text not null default '',
  tipo          text not null check (tipo in ('tarea','proveedor','integracion')),
  ok_at         text,
  trabajo_at    text,
  error_at      text,
  error         text not null default '',
  fallos        integer not null default 0,
  desde         text,
  saltar_hasta  text,
  avisado_at    text,
  saldo_at      text,
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists salud_espacio on salud(espacio);

create table if not exists avisos_dados (
  id          text not null,
  owner_id    text not null references users(id) on delete cascade,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (owner_id, id)
);
create index if not exists avisos_dados_dueno on avisos_dados(owner_id);

create table if not exists push_suscripciones (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  dispositivo  text not null default '',
  origen       text not null default '',
  ok_at        text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists push_suscripciones_dueno on push_suscripciones(owner_id);
create index if not exists push_suscripciones_persona on push_suscripciones(user_id);
