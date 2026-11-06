-- ============================================================
-- EL AVISO A LA HORA de lo que se publica A MANO («La publico yo»: un carrusel con la música de Instagram, un sticker…)
--
-- Lo que se publica desde el teléfono no lo saca la cola: si nadie se acuerda a su hora, no sale. El cron avisa a la
-- campana 10 minutos antes y a la hora, a quien la lleva (o a todo el equipo), con el enlace a /a-mano/…
--
-- Las publicaciones viven en el JSON de su calendario (`calendars.days`): buscarlas ahí cada minuto sería leer todos los
-- meses de todos los clientes en cada vuelta. Por eso cada publicación a mano tiene aquí UNA fila con su momento (`para`,
-- ISO en UTC) y lo que ya se avisó (`previo_at`, `hora_at`): el cron la encuentra con UNA consulta por el índice y no
-- repite un aviso. La escribe `sincronizarAvisosAMano` (worker/lib/avisosAMano.js) cada vez que se guarda un calendario
-- con algo a mano (desde `resincronizarCalendario`, por donde pasan todas las escrituras de un calendario); si el
-- momento cambia, los avisos se vuelven a dar. Lo que dejó de ser a mano (o se publicó, o se movió de mes) lo descarta
-- el cron al comprobarlo contra su calendario antes de avisar: la fila es un atajo y el calendario es la verdad.
--
-- `id` = «<calendario>|<publicación>». Tiene dueño y cliente: la capa de acceso la acota como a las demás.
-- ============================================================

create table if not exists avisos_a_mano (
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  client_id    text not null references clients(id) on delete cascade,
  calendar_id  text not null references calendars(id) on delete cascade,
  post_id      text not null,
  para         text not null,
  previo_at    text,
  hora_at      text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists avisos_a_mano_pendientes on avisos_a_mano(hora_at, para);
create index if not exists avisos_a_mano_dueno on avisos_a_mano(owner_id);
create index if not exists avisos_a_mano_cliente on avisos_a_mano(client_id);
create index if not exists avisos_a_mano_cal on avisos_a_mano(calendar_id);
