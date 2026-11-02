-- ============================================================
-- Las notas fijas de cada día de la semana de una empresa
--
-- «Los lunes, muebles y camas» (D'CASA), «los miércoles, promo Feria
-- Chorrera» (Feria del Lente): lo que se repite cada semana y no es un
-- formato ni un tipo de contenido. Van aparte del plan semanal
-- (`plan_contenido`, `ritmo_contenido`) a propósito: «Volver al estándar de
-- la agencia» borra el plan y no debe llevarse las notas. JSON
-- { "0".."6": texto } (src/lib/notasSemana.js).
-- ============================================================

alter table clients add column notas_semana text check (notas_semana is null or json_valid(notas_semana));
