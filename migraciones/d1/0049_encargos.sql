-- ============================================================
-- Encargos del Estudio: una cadena de piezas que sigue en el servidor
--
-- Un encargo es lo que antes orquestaba el navegador (el lote: el director
-- diseña, se pide cada pieza, se controla, se corrige) escrito como una lista
-- de pasos con su avance. Lo avanza el servidor —el Durable Object del espacio
-- con su alarma, el cron de respaldo y el navegador si está abierto—, así que
-- cerrar la aplicación ya no lo para. `bloqueado_hasta` es el permiso de paso,
-- como en `estudio_trabajos`. Ver worker/lib/estudio/encargos.js.
-- ============================================================

create table if not exists estudio_encargos (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  client_id       text not null references clients(id) on delete cascade,
  tipo            text not null default 'lote',
  titulo          text not null default '',
  estado          text not null default 'en_marcha' check (estado in ('en_marcha','hecho','fallido','cancelado')),
  datos           text not null default '{}' check (json_valid(datos)),
  pasos           text not null default '[]' check (json_valid(pasos)),
  nota            text not null default '',
  error           text not null default '',
  creado_por      text,
  bloqueado_hasta text not null default '',
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  terminado_at    text
);
create index if not exists estudio_encargos_dueno on estudio_encargos(owner_id);
create index if not exists estudio_encargos_cliente on estudio_encargos(client_id);
create index if not exists estudio_encargos_estado on estudio_encargos(estado, updated_at);
