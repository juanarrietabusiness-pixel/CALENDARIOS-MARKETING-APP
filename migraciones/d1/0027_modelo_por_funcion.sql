-- ============================================================
-- Un modelo por función, y Meta (Muse Spark) entre ellos
--
-- Hasta aquí había UN modelo para todo el texto (`ia_modelo`). La agencia
-- quiere escoger por función —redacción, guiones, escribir mirando el
-- contenido, el asistente, los análisis— y poder usar Muse Spark de Meta,
-- además de qué motor de imagen adapta a 4:5.
--
-- Va en una columna JSON y no en `ia_modelo`, cuyo CHECK sólo admite los
-- modelos de Anthropic: cambiar un CHECK en SQLite es reconstruir la tabla
-- (ver 0022), y para añadir una opción no hace falta. Lo valida
-- `limpiarModelos()` (worker/lib/configIA.js) al leer y la ruta al guardar.
-- ============================================================

alter table ajustes_espacio add column ia_modelos text check (ia_modelos is null or json_valid(ia_modelos));
