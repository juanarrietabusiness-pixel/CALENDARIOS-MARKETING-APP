-- ============================================================
-- La galería del Estudio: carruseles y reels agrupados, y repetidos
--
--   1. estudio_carpetas.tipo / orden: una carpeta que crea el flujo del
--      carrusel o del reel IA lleva su tipo («carrusel» | «reel»; vacío, una
--      carpeta normal) y el ORDEN de sus piezas (ids de estudio_archivos,
--      JSON). Con eso la galería enseña UNA tarjeta «Carrusel · N láminas»
--      en vez de N sueltas, y la descarga sale en orden.
--   2. estudio_archivos.huella: el SHA-256 de los bytes de lo SUBIDO a mano.
--      Subir dos veces la misma imagen devuelve la ficha que ya había en vez
--      de guardar otra copia («Ya estaba en la galería»). Vacía en lo
--      generado y en lo de antes: no se compara con nada.
--
-- Sin `check` en `tipo` (se valida en código, como el resto del Estudio).
-- ============================================================

alter table estudio_carpetas add column tipo text not null default '';
alter table estudio_carpetas add column orden text not null default '[]' check (json_valid(orden));
alter table estudio_archivos add column huella text not null default '';

create index if not exists estudio_archivos_huella on estudio_archivos(client_id, huella);
