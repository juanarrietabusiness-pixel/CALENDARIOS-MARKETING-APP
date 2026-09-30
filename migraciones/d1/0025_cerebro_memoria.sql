-- ============================================================
-- La memoria de decisiones del cerebro
--
-- Lo que el cliente aprueba, devuelve o comenta; lo que rinde en redes;
-- lo que el equipo corrige de lo que escribió la IA. Todo eso pasa DESPUÉS
-- de escribir, y hasta ahora no volvía a ningún prompt. Aquí se guarda lo
-- que hace falta para que vuelva (docs/propuesta-cerebro-por-cliente.md):
--
--   cerebro_senales     Cada «salió bien / salió mal» con su motivo. Una
--                       por publicación y tipo (`clave`): si el cliente
--                       cambia de opinión, la señal se REEMPLAZA, no se
--                       cuenta dos veces. Es lo que lee la IA cuando se le
--                       pide proponer reglas, y con lo que se aprenden
--                       los pesos.
--   cerebro_usos        Qué notas del cerebro se le dieron a la IA al
--                       escribir cada publicación. Sin esto no se sabe a
--                       qué nota atribuirle un sí o un no.
--   cerebro_memoria     Los pesos que se aprenden: cuánto sube o baja cada
--                       nota en la búsqueda y qué pares de notas se
--                       refuerzan (las sinapsis doradas del mapa). Un
--                       renglón por cliente. `pesos` es lo que se lee en
--                       cada búsqueda; `aplicadas` es la contabilidad para
--                       no contar dos veces la misma señal, y sólo se lee
--                       al aprender.
--   cerebro_propuestas  Las reglas que la IA propone y que una persona
--                       acepta, corrige o descarta. Nada entra al cerebro
--                       sin pasar por ahí, salvo las notas automáticas con
--                       las palabras del cliente.
--
-- Sin `check` en `tipo` ni en `estado`, como en 0024: cambiar un check en
-- SQLite es reconstruir la tabla, y los tipos de señal van a crecer. Se
-- validan en código (worker/lib/cerebro/aprender.js).
-- ============================================================

pragma foreign_keys = on;

create table if not exists cerebro_senales (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  clave       text not null,
  tipo        text not null,
  post_id     text not null default '',
  resultado   real not null default 0.5,
  resumen     text not null default '',
  detalle     text not null default '{}' check (json_valid(detalle)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_senales_clave on cerebro_senales(client_id, clave);
create index if not exists cerebro_senales_reciente on cerebro_senales(client_id, tipo, updated_at);
create index if not exists cerebro_senales_dueno on cerebro_senales(owner_id);

create table if not exists cerebro_usos (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  post_id     text not null,
  rutas       text not null default '[]' check (json_valid(rutas)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_usos_post on cerebro_usos(client_id, post_id);
create index if not exists cerebro_usos_dueno on cerebro_usos(owner_id);

create table if not exists cerebro_memoria (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  pesos       text not null default '{}' check (json_valid(pesos)),
  aplicadas   text not null default '{}' check (json_valid(aplicadas)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists cerebro_memoria_cliente on cerebro_memoria(client_id);
create index if not exists cerebro_memoria_dueno on cerebro_memoria(owner_id);

create table if not exists cerebro_propuestas (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  titulo      text not null,
  texto       text not null,
  motivo      text not null default '',
  senales     text not null default '[]' check (json_valid(senales)),
  estado      text not null default 'pendiente',
  nota_id     text not null default '',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelta_at text
);
create index if not exists cerebro_propuestas_estado on cerebro_propuestas(client_id, estado, created_at);
create index if not exists cerebro_propuestas_dueno on cerebro_propuestas(owner_id);
