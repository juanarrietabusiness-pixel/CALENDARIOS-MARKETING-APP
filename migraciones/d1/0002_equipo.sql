-- ============================================================
-- Equipo — varias personas sobre el mismo espacio de trabajo
--
-- EL PROBLEMA QUE RESUELVE
--
-- Hasta aquí `owner_id` quería decir dos cosas a la vez: «de quién son
-- estos datos» y «quién ha iniciado sesión». Con una sola cuenta de
-- agencia eso no se nota. En cuanto entran dos personas, deja de ser
-- verdad: los clientes son de LA AGENCIA, no de quien escribe.
--
-- LA DECISIÓN: no se toca `owner_id` de ninguna tabla existente.
--
-- `owner_id` pasa a significar «el espacio de trabajo», y el espacio se
-- identifica por el id del administrador que lo fundó. Las filas que ya
-- existen siguen valiendo tal cual: el administrador ya era su propio
-- espacio sin saberlo. Una migración que reescribiera `owner_id` en
-- siete tablas a la vez sería, además de innecesaria, la clase de paso
-- que no se puede deshacer si sale mal.
--
-- Lo que se añade son dos tablas:
--
--   memberships   quién pertenece a qué espacio, y con qué papel.
--   invitaciones  el enlace de un solo uso con el que entra alguien
--                 nuevo, sin que nadie tenga que saber su contraseña.
--
-- POR QUÉ UN ENLACE Y NO «crear la cuenta y pasarle la contraseña»
--
-- Porque una contraseña que ha pasado por un tercero ya no es de quien
-- la usa. El enlace lleva un testigo aleatorio, caduca, y la contraseña
-- la escribe la persona invitada en su propio navegador: el
-- administrador no llega a verla nunca. Y no hace falta un proveedor de
-- correo —que es lo que aplaza los enlaces mágicos al hub—: el enlace
-- se copia y se manda por donde ya se habla con esa persona.
-- ============================================================

pragma foreign_keys = on;

-- ------------------------------------------------------------
-- Pertenencia
--
-- Una fila por persona: nadie está en dos espacios. Es una limitación
-- a propósito —la agencia es una— y se nota en la clave primaria, que
-- es `user_id` y no un id propio: así la base misma impide el caso que
-- no se ha pensado.
--
-- `nombre` y `color` viven aquí y no en `users` porque son de cara al
-- equipo: es lo que se ve en la presencia y en «Ana está editando
-- esto». `users` guarda la identidad; esto, cómo se la presenta.
-- ------------------------------------------------------------

create table if not exists memberships (
  user_id    text primary key references users(id) on delete cascade,
  owner_id   text not null references users(id) on delete cascade,
  rol        text not null default 'editor' check (rol in ('admin','editor')),
  nombre     text not null default '',
  color      text not null default '#1E90FF',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- `owner_id` va en el WHERE de todas las consultas de la capa de acceso.
create index if not exists memberships_owner on memberships(owner_id);

-- ------------------------------------------------------------
-- Invitaciones
--
-- Se guarda el SHA-256 del testigo, nunca el testigo, por el mismo
-- motivo que en `sessions`: un volcado de D1 no puede devolver enlaces
-- utilizables.
--
-- `aceptada_at` no borra la fila: queda el registro de quién invitó a
-- quién y cuándo. Una invitación con fecha ya no sirve para entrar.
-- ------------------------------------------------------------

create table if not exists invitaciones (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  token_hash  text not null,
  email       text not null default '',
  nombre      text not null default '',
  rol         text not null default 'editor' check (rol in ('admin','editor')),
  creada_por  text not null references users(id) on delete cascade,
  expires_at  text not null,
  aceptada_at text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Único: dos invitaciones con el mismo testigo serían el mismo enlace
-- abriendo dos puertas, y el `where token_hash = ?` cogería una al azar.
create unique index if not exists invitaciones_testigo  on invitaciones(token_hash);
create index        if not exists invitaciones_owner    on invitaciones(owner_id);
create index        if not exists invitaciones_creador  on invitaciones(creada_por);
