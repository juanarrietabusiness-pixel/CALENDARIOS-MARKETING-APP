-- ============================================================
-- Un solo mes por cliente
--
-- Con el calendario siempre activo, el mes deja de verse: es el cajón
-- donde se guardan las publicaciones de ese mes. Dos cajones del mismo
-- mes serían dos verdades —¿cuál se enseña?, ¿en cuál entra lo nuevo?—, y
-- hasta ahora nada lo impedía: «Duplicar calendario» creaba «Octubre 2026
-- (copia)» con el mismo mes, y «Subir» con una lista desactualizada
-- podía crear un segundo octubre.
--
-- Antes de escribir esto se comprobó en producción que no había ningún
-- mes repetido (3 calendarios, ninguno duplicado): el índice se crea sin
-- tener que juntar nada. Si una base local tuviera repetidos, la
-- migración fallaría aquí con «UNIQUE constraint failed», que es lo que
-- debe pasar: juntarlos es una decisión de la agencia, no del SQL.
-- ============================================================

create unique index if not exists calendars_mes on calendars(client_id, year, month);
