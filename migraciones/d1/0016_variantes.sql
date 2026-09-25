-- ============================================================
-- La historia que acompaña al post
--
-- Una publicación puede salir dos veces por red: como post y, unos
-- minutos después, como historia (con sus propias imágenes 9:16). Cada
-- salida es una fila de la cola, así que la fila dice cuál de las dos es.
-- ============================================================

alter table publicaciones_programadas add column variante text not null default 'post' check (variante in ('post','historia'));
create index if not exists publicaciones_programadas_post on publicaciones_programadas(calendar_id, post_id, red, variante);
