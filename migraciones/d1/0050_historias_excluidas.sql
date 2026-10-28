-- ============================================================
-- Historias automáticas: «Que no salga» es para siempre
--
-- Antes la pieza se BORRABA, y la aplicación la volvía a preparar en cuanto se
-- abría (la publicación seguía sin historia hecha), así que volvía a salir.
-- Ahora la fila se queda con `excluida = 1`: no sale y no se vuelve a preparar.
-- «Que vuelva a salir» la pone otra vez a 0.
-- ============================================================

alter table historias_auto_piezas add column excluida integer not null default 0 check (excluida in (0, 1));
