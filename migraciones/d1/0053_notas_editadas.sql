-- ============================================================
-- Qué le cambió una persona a una nota del cerebro
--
-- Hasta ahora «editada a mano» era `updated_at <> created_at`, y eso lo
-- cambiaba CUALQUIER guardado: marcarla interna o cambiarle el tipo también.
-- Con «Actualizar lo que cambió» esas notas se quedaban con el texto viejo del
-- repositorio sin que nadie lo decidiera (ROFER siguió con su WhatsApp viejo).
--
-- `editada` son dos bits (worker/lib/cerebro/notas.js, `textoEditado`, `ajustada`):
--   1  una persona cambió el TEXTO o el título: una importación no la pisa;
--   2  sólo le ajustaron el tipo o el candado: una importación le pone el
--      texto nuevo pero conserva su tipo y si es interna.
--
-- Las de antes no se sabe qué se les cambió: las que tienen las fechas
-- distintas quedan como «texto editado» (1), que es lo que valían hasta hoy.
-- ============================================================

alter table cerebro_notas add column editada integer not null default 0;

update cerebro_notas set editada = 1 where updated_at <> created_at;
