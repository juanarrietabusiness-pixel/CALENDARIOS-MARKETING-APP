-- ============================================================
-- La página de aprobación, rehecha
--
--   1. calendars.opciones: lo que la agencia decide al enviar el enlace
--      —fecha límite, mensaje para el cliente, programar al aprobar—.
--      JSON, porque son opciones del envío y van a crecer.
--   2. calendars.revision_enviada / revision_revisor: el cliente pulsó
--      «Enviar mi revisión». Antes no había un final: la agencia no
--      sabía cuándo el cliente había terminado.
--   3. comentarios_aprobacion: la conversación de cada publicación. Un
--      solo campo de comentario se pisaba con cada respuesta y la
--      agencia no podía contestar.
-- ============================================================

pragma foreign_keys = on;

alter table calendars add column opciones text not null default '{}' check (json_valid(opciones));
alter table calendars add column revision_enviada text;
alter table calendars add column revision_revisor text not null default '';

create table if not exists comentarios_aprobacion (
  id          text primary key,
  calendar_id text not null references calendars(id) on delete cascade,
  post_id     text not null,
  autor       text not null check (autor in ('cliente','agencia')),
  nombre      text not null default '',
  texto       text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists comentarios_aprobacion_cal on comentarios_aprobacion(calendar_id, created_at);
