-- ============================================================
-- Campañas con varios conjuntos y anuncios
--
-- Una campaña creada desde la app lleva ahora hasta 3 conjuntos (públicos)
-- y hasta 6 anuncios, que van en cada conjunto: hasta 18 anuncios de Meta.
-- Activarla enciende TODOS (anuncios y conjuntos, y la campaña la última),
-- así que hacen falta todos sus ids. Las columnas de antes (`conjunto_id`,
-- `anuncio_id`…) siguen con el primero, para las campañas de antes y para
-- quien las lea.
-- ============================================================

alter table campanas_anuncios add column ids text not null default '{}' check (json_valid(ids));
