-- ============================================================
-- La BIBLIOTECA DE SONIDO de la AGENCIA: música y efectos para TODOS sus clientes
--
-- La agencia pidió ahorrar créditos de Suno: reutilizar la música ya generada, subir la suya y tener, por cliente y
-- para toda la agencia, una biblioteca de música y de efectos para sus videos.
--
--   · Lo de UN cliente sigue en `estudio_archivos` (tipo «audio»): ya es suyo y ya se sirve por
--     /api/media/clientes/<c>/…. La categoría sale del `modelo` (musica-suno, musica-subida, musica-agencia →
--     música; efecto-subido, efecto-agencia → efecto), el nombre es su `prompt`, la «favorita» su `favorito` y las
--     etiquetas, el BPM y la duración van en `ajustes.biblioteca`. Lo que ya había (las músicas de Suno y las subidas)
--     sale en la biblioteca del cliente SIN migrar nada.
--   · Lo de la AGENCIA va aquí: sin cliente, con su categoría, nombre, etiquetas (JSON: ánimo, ritmo), BPM y duración
--     si se saben, y `favorita`. El archivo vive en R2 bajo `biblioteca/<espacio>/…` (NO cuelga de `clientes/`: lo
--     sirve /api/sonidos/agencia/<id>/audio con la sesión del espacio y por trozos, para el iPhone).
--   · `datos`: lo que se sabe de dónde salió (el estilo que se le pidió a Suno, si se pasó de un cliente; de qué
--     archivo). `huella`: el SHA-256 de los bytes, para no guardar dos veces la misma pista.
--
-- La cambian quien administra y los editores sin clientes asignados (como las estructuras de guion); verla y usarla,
-- todos. Con dueño, declarada en worker/lib/acceso.js (TABLAS_CON_DUENO). Lo que toca base y R2, en
-- worker/lib/estudio/sonidos.js; lo puro, en src/lib/bibliotecaSonido.js.
-- ============================================================

pragma foreign_keys = on;

create table if not exists biblioteca_sonidos (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  categoria   text not null default 'musica' check (categoria in ('musica', 'efecto')),
  clave       text not null,
  mime        text not null default 'audio/mpeg',
  bytes       integer not null default 0,
  nombre      text not null default '',
  etiquetas   text not null default '[]' check (json_valid(etiquetas)),
  bpm         integer check (bpm is null or (bpm >= 40 and bpm <= 240)),
  duracion    real check (duracion is null or (duracion >= 0 and duracion <= 3600)),
  favorita    integer not null default 0 check (favorita in (0, 1)),
  origen      text not null default 'subida',
  huella      text not null default '',
  datos       text not null default '{}' check (json_valid(datos)),
  creado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists biblioteca_sonidos_dueno on biblioteca_sonidos(owner_id, categoria, created_at);
create unique index if not exists biblioteca_sonidos_clave on biblioteca_sonidos(owner_id, clave);
