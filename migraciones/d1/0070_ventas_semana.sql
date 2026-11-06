-- ============================================================
-- «Tus ventas de la semana»: lo que el cliente apunta por su enlace (curso de campañas, E.1)
--
-- Meta ve las conversaciones que empieza un anuncio a WhatsApp, no las ventas que se cierran por mensaje. Sin ellas
-- no hay tasa de cierre ni ROAS de verdad, y muchos clientes no las pasan. Un enlace fijo por cliente, sin sesión
-- (`/ventas?t=…`), que se llena en 30 segundos cada semana; la agencia también puede escribirlas desde la app.
--
--   1. ventas_semana: una fila por cliente y semana (su LUNES, «AAAA-MM-DD» en la hora de Panamá). Ventas cerradas
--      por WhatsApp y por cuánto (obligatorias); cuántas vinieron de los anuncios y lo vendido por otros canales
--      (opcionales: null es «no lo sé», no «ninguna»). `origen` dice quién la escribió (el cliente por su enlace o la
--      agencia en la app) y `por`, la persona del equipo (vacío si fue el cliente).
--   2. anuncios_clientes.testigo_ventas: el testigo del enlace del cliente. Se crea UNA vez y se reutiliza siempre:
--      regenerarlo mataría el enlace que el cliente ya tiene guardado. (Las otras columnas que añade el curso a esta
--      tabla, `negocio` y `etapas`, van en 0069.)
--
-- Con dueño y cliente, declarada en worker/lib/acceso.js. La página pública la encuentra por el testigo
-- (worker/lib/publico.js) y todo lo demás va por la capa de acceso con el espacio de ese cliente.
-- ============================================================

pragma foreign_keys = on;

create table if not exists ventas_semana (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  client_id      text not null references clients(id) on delete cascade,
  semana         text not null check (semana glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ventas         integer not null default 0 check (ventas >= 0),
  monto          real not null default 0 check (monto >= 0),
  de_anuncios    integer check (de_anuncios is null or de_anuncios >= 0),
  otros_canales  real check (otros_canales is null or otros_canales >= 0),
  nota           text not null default '',
  origen         text not null default 'cliente' check (origen in ('cliente','agencia')),
  por            text not null default '',
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (client_id, semana)
);
create index if not exists ventas_semana_dueno on ventas_semana(owner_id);
create index if not exists ventas_semana_cliente on ventas_semana(client_id, semana);

alter table anuncios_clientes add column testigo_ventas text;
create unique index if not exists anuncios_clientes_testigo_ventas on anuncios_clientes(testigo_ventas) where testigo_ventas is not null;
