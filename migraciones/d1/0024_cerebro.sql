-- ============================================================
-- El cerebro de cada cliente
--
-- Hasta ahora lo que la IA sabía de un cliente era una FOTO: el ADN se
-- leía una vez del repositorio, se guardaba entero en la ficha
-- (`clients.github_context`) y viajaba completo en cada llamada. Aquí
-- pasa a ser un conjunto de NOTAS por cliente: cortas, con título y tipo,
-- que se pueden leer, corregir, ocultar de los textos o borrar una a una,
-- y que se buscan por pasajes (worker/lib/cerebro/).
--
-- Una tabla, y NO una por cliente: la separación entre clientes no está en
-- el esquema sino en la capa de acceso (`client_id` en TABLAS_CON_CLIENTE),
-- igual que en el resto de los datos. El índice de búsqueda sí es uno por
-- cliente y vive en R2 (`cerebro/<cliente>/indice.json`), FUERA del prefijo
-- `clientes/` que sirve /api/media: un índice de un cliente no puede
-- construirse con notas de otro ni servirse por la ruta de las imágenes.
--
-- `ruta` es el nombre estable de la nota dentro del cliente (un slug):
-- los `[[enlaces]]` de unas notas a otras se resuelven por ella, y es única
-- por cliente. Sin `check` en `tipo` ni en `origen`: cambiar un check en
-- SQLite es reconstruir la tabla (0022), y los tipos van a crecer. Se
-- validan en código (worker/lib/cerebro/notas.js).
--
-- `resumen` y `caracteres` se calculan al ESCRIBIR la nota (notas.js →
-- `derivados()`) y se guardan aparte: la lista del cerebro y su estado los
-- leen sin traer el texto entero de cada nota, que en un cliente con 400
-- notas de 200 000 caracteres no cabe en una respuesta de D1. Quien escriba
-- una nota tiene que llenarlos.
--
-- `interna` (0/1): la nota la ve el equipo y el asistente, pero NUNCA
-- entra en lo que se escribe para publicar. `fuente_sha` es el SHA del
-- archivo del repositorio de donde salió: al importar de nuevo, lo que no
-- cambió no se toca.
-- ============================================================

pragma foreign_keys = on;

create table if not exists cerebro_notas (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  ruta        text not null,
  titulo      text not null default '',
  texto       text not null default '',
  resumen     text not null default '',
  caracteres  integer not null default 0,
  tipo        text not null default 'nota',
  origen      text not null default 'manual',
  fuente      text not null default '',
  fuente_sha  text not null default '',
  interna     integer not null default 0,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create unique index if not exists cerebro_notas_ruta on cerebro_notas(client_id, ruta);
create index if not exists cerebro_notas_dueno on cerebro_notas(owner_id);
create index if not exists cerebro_notas_cliente on cerebro_notas(client_id);
