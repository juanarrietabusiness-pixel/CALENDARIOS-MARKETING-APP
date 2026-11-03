-- ============================================================
-- «Aplicar en el perfil», guardado y compartido por el equipo
--
-- La lista de cambios de una auditoría se marcaba en el navegador de cada uno
-- (localStorage): lo que hacía una persona no lo veía otra. `aplicado` es
-- { clave: { hecho, por, at, auto } } (src/lib/auditoria.js, `limpiarAplicado`);
-- `auto` = lo marcó «Comprobar en Instagram». `optimizado_at`: cuándo se dio
-- el perfil por optimizado (se ve en la lista y en el enlace del cliente).
-- ============================================================

alter table auditorias add column aplicado text not null default '{}' check (json_valid(aplicado));
alter table auditorias add column optimizado_at text;
