-- ============================================================
-- Un solo banco de ideas para toda la agencia
--
-- Cada cliente guardaba su banco dentro de su propia fila
-- (`clients.ideas_bank`, un JSON). Así no había sitio para lo que todavía
-- no es de nadie: el video de referencia que se encuentra en el teléfono y
-- aún no se sabe para qué empresa es. Ahora cada idea es una FILA con su
-- cliente o sin él (vacío = general: sale en el banco de todos los clientes).
--
--   · `datos` es la idea tal cual la usa la pantalla (formato, idea, guion,
--     descripción, enlace de referencia…): la misma forma que tenía dentro
--     del JSON, para que llevarla al calendario no cambie.
--   · Lo que había en cada cliente pasa aquí con su cliente puesto, y el
--     JSON se vacía: si esta migración se reaplicara, no volverían ideas que
--     alguien borró después. El id es el de la idea (`insert or ignore`).
-- ============================================================

pragma foreign_keys = on;

create table if not exists banco_ideas (
  id          text primary key,
  owner_id    text not null references users(id)   on delete cascade,
  client_id   text references clients(id)          on delete cascade,
  datos       text not null default '{}' check (json_valid(datos)),
  creada_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists banco_ideas_lista on banco_ideas(owner_id, client_id, created_at);
create index if not exists banco_ideas_cliente on banco_ideas(client_id);

insert or ignore into banco_ideas (id, owner_id, client_id, datos, created_at, updated_at)
  select
    coalesce(nullif(json_extract(j.value, '$.id'), ''), c.id || '-' || j.key),
    c.owner_id,
    c.id,
    j.value,
    coalesce(json_extract(j.value, '$._addedAt'), json_extract(j.value, '$.createdAt'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  from clients c, json_each(case when json_valid(c.ideas_bank) then c.ideas_bank else '[]' end) j
  where j.type = 'object';

update clients set ideas_bank = '[]' where ideas_bank <> '[]';
