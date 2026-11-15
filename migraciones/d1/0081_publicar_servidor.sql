-- ============================================================
-- PUBLICAR DESDE EL SERVIDOR, y lo que el cliente hace con su enlace
--
-- 1. `programar_lotes`: «Programar lo aprobado» como encargo del SERVIDOR. Antes la pantalla preparaba cada imagen (JPEG
--    y copias 4:5 / 9:16 / TikTok) una tras otra y guardaba al final: si se cerraba la pestaña a la mitad no quedaba
--    nada. Ahora cada lote es una fila con lo que falta (`pendientes`), lo que salió (`hechas`) y lo que no y por qué
--    (`fallidas`); la bomba del espacio (su Durable Object, worker/lib/estudio/bomba.js) da un paso por publicación —el
--    Container la prepara y `programar` la mete en la cola— y guarda el avance. `bloqueado_hasta` es el permiso de un
--    paso a la vez, como en los encargos del Estudio. Lo lanzan la pantalla, Claude por MCP y «Aprobar todas» del
--    cliente con «Programar al aprobar» encendido (worker/lib/programarServidor.js).
--
-- 2. `calendars.cliente_abrio_at`: cuándo abrió el cliente su enlace (como mucho una escritura por hora; la del equipo
--    con sesión no cuenta). «Enviar a cliente» lo enseña. NO toca `updated_at`: es la condición con la que otros
--    escriben el mes.
--
-- 3. `clients.aprueba_antes`: ¿este cliente aprueba antes de publicar? 1 (sí) por defecto, que es lo de hoy. Con 0,
--    «Programar lo aprobado» programa lo LISTO (pieza, hora y texto) aunque el cliente no lo haya aprobado.
-- ============================================================

create table if not exists programar_lotes (
  id              text primary key,
  owner_id        text not null references users(id) on delete cascade,
  client_id       text not null references clients(id) on delete cascade,
  calendar_id     text not null references calendars(id) on delete cascade,
  estado          text not null default 'en_marcha' check (estado in ('en_marcha','hecho','fallido')),
  origen          text not null default 'agencia',
  pendientes      text not null default '[]',
  hechas          text not null default '[]',
  fallidas        text not null default '[]',
  nota            text not null default '',
  creado_por      text,
  bloqueado_hasta text not null default '',
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  terminado_at    text
);
create index if not exists programar_lotes_vivos on programar_lotes(owner_id, estado);
create index if not exists programar_lotes_cliente on programar_lotes(client_id);
create index if not exists programar_lotes_cal on programar_lotes(calendar_id);

alter table calendars add column cliente_abrio_at text;
alter table clients add column aprueba_antes integer not null default 1 check (aprueba_antes in (0,1));
