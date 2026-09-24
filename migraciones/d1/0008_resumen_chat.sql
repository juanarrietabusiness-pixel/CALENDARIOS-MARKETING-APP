-- ============================================================
-- El resumen de las conversaciones largas del asistente
--
-- Una fila por cliente (id = client_id). `hasta` es el created_at del
-- último mensaje plegado: lo posterior se manda entero al modelo, lo
-- anterior sólo como este resumen. Antes el historial se cortaba en los
-- últimos 50 mensajes y lo de más atrás se perdía sin que nadie lo
-- decidiera.
-- ============================================================

pragma foreign_keys = on;

create table if not exists chat_resumenes (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  owner_id   text not null references users(id)   on delete cascade,
  content    text not null default '',
  hasta      text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists chat_resumenes_cliente on chat_resumenes(client_id);
create index if not exists chat_resumenes_dueno on chat_resumenes(owner_id);
