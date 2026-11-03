-- ============================================================
-- Más de una historia automática al día (hasta 5)
--
-- Era una al día por cliente. La agencia quiere poder subir a más si todo va
-- bien: la primera sale a su hora y las demás cada 2 horas (sin pasar de las
-- 22:00; si no caben, más juntas), cada una con una publicación distinta
-- (src/lib/historiasAuto.js, `horasDelDia`, `elegirPiezas`).
-- ============================================================

alter table historias_auto add column por_dia integer not null default 1 check (por_dia between 1 and 5);
