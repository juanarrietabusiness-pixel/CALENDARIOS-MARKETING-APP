-- ============================================================
-- EL MANUAL DEL EDITOR DE VIDEOS GRABADOS, con sus versiones
--
-- La base vive en el código (src/lib/manualEditor.js); aquí sólo lo que la AGENCIA cambió, por partes (`partes`: un
-- objeto «id de la parte → texto»; lo que no está, vale el de la casa). Cada guardado es una FILA nueva con el número
-- siguiente y vale la última: volver atrás es guardar otra versión con las partes de una vieja, así que la historia
-- nunca se borra. `bases` guarda la huella de la base de la casa de cada parte cambiada cuando se guardó: si la casa
-- mejora esa parte después, la pantalla lo avisa.
--
-- Guardar va con la versión que se leyó como condición (worker/rutas/manualEditor.js): si otra persona guardó, 409 y la
-- pantalla junta por partes. El índice único (owner_id, version) es la red de ese «sólo uno gana».
-- ============================================================

create table if not exists manual_editor_versiones (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  version     integer not null check (version >= 1),
  partes      text not null default '{}' check (json_valid(partes)),
  bases       text not null default '{}' check (json_valid(bases)),
  motivo      text not null default '',
  por         text,
  por_nombre  text not null default '',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists manual_editor_version on manual_editor_versiones(owner_id, version);
