-- ============================================================
-- WhatsApp e investigación (curso de campañas, entrega 8)
--
--   1. anuncios_clientes.kit_whatsapp: el KIT DE WHATSAPP BUSINESS del cliente tal como lo GUARDÓ una persona (la
--      bienvenida, la ausencia, las respuestas rápidas con su atajo, las etiquetas por etapa del ciclo y un guion de
--      ventas por producto). La IA lo propone y no escribe aquí: sólo «Guardar» (worker/lib/whatsapp.js). Lo limpia
--      src/lib/kitWhatsApp.js (`limpiarKitWhatsApp`) antes de escribirlo.
--   2. anuncios_clientes.testigo_voz: el testigo del enlace «La voz de tus clientes» (`/voz?t=…`). Se crea UNA vez y se
--      reutiliza: regenerarlo mataría el enlace que el cliente ya reenvió a sus clientes.
--   3. voz_cliente: cada respuesta a esa encuesta (las respuestas en JSON, el nombre si lo dio, si permite usarla como
--      testimonio, qué compró y si recomendaría). `llevada_at`: cuándo se llevó al estudio de mercado («Llevar al
--      estudio»): así se sabe cuáles son nuevas.
--
-- Las dos columnas de `anuncios_clientes` (0041) se escriben con `actualizar` y no con `guardar`: la fila es la de lo
-- que decide la agencia de los anuncios de un cliente, con el informe (0041), los números del negocio (0069) y el
-- enlace de ventas (0070), y un `guardar` las pisaría.
--
-- Con dueño y cliente, declarada en worker/lib/acceso.js. La página pública la encuentra por el testigo
-- (worker/lib/publico.js, `clienteDeVozPorTestigo`) y todo lo demás va por la capa de acceso con el espacio de ese
-- cliente.
-- ============================================================

pragma foreign_keys = on;

create table if not exists voz_cliente (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  respuestas  text not null default '{}' check (json_valid(respuestas)),
  nombre      text not null default '',
  permiso     integer not null default 0 check (permiso in (0, 1)),
  producto    text not null default '',
  recomienda  text not null default '' check (recomienda in ('', 'si', 'tal-vez', 'no')),
  llevada_at  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists voz_cliente_dueno on voz_cliente(owner_id);
create index if not exists voz_cliente_cliente on voz_cliente(client_id, created_at);

alter table anuncios_clientes add column kit_whatsapp text not null default '{}' check (json_valid(kit_whatsapp));
alter table anuncios_clientes add column testigo_voz text;
create unique index if not exists anuncios_clientes_testigo_voz on anuncios_clientes(testigo_voz) where testigo_voz is not null;
