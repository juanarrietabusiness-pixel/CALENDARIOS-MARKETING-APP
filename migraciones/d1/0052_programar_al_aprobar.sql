-- ============================================================
-- «Programar al aprobar» es de cada CLIENTE, no de cada mes
--
-- Vivía en `calendars.opciones`, mes por mes: cada mes nuevo nacía apagado
-- y la agencia lo encendía una vez y dejaba de funcionar al mes siguiente.
-- Ahora se enciende una vez por cliente. Lo encendido en un mes de antes se
-- sigue leyendo (worker/lib/publicador.js, `programarAlAprobar`).
-- ============================================================

alter table clients add column programar_al_aprobar integer not null default 0 check (programar_al_aprobar in (0,1));
