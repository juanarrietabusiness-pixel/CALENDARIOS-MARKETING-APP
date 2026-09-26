-- ============================================================
-- Qué aprobó el cliente: la idea o la pieza final
--
-- `tipo` ('idea' | 'pieza') es lo que se le pedía al aprobar, y `huella`
-- la del texto que vio. Con eso la agencia sabe si una publicación está
-- «por producir» (idea aprobada) o «por programar» (pieza aprobada), y
-- si cambió algo después de que el cliente dijera que sí. Las filas de
-- antes quedan en null: valen por lo que se pide hoy (lib/aprobacion.js).
-- ============================================================

alter table approvals add column tipo text check (tipo is null or tipo in ('idea','pieza'));
alter table approvals add column huella text;
