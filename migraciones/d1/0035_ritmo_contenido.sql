-- ============================================================
-- El ritmo de contenido de cada cliente
--
-- Qué tipo de contenido toca cada día de la semana (0 = domingo):
-- {"1":"anuncio","2":"beneficios",…}. Sin guardar, el de la agencia
-- (src/lib/pilares.js, RITMO_POR_DEFECTO). Lo edita la ficha del cliente
-- (pestaña Semanal) y lo usa «Planificar mes».
-- ============================================================

alter table clients add column ritmo_contenido text check (ritmo_contenido is null or json_valid(ritmo_contenido));
