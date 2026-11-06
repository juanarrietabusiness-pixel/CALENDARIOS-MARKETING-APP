-- ============================================================
-- La REVISIÓN 3Q de lo que corre en el Ads Manager (curso de campañas, entrega 5)
--
-- Dos columnas más en `anuncios_clientes` (0041), la fila de lo que decide la agencia de los anuncios de un cliente
-- (ya declarada en la capa de acceso con su `client_id`, y con `negocio` y `etapas` de 0069):
--
--   1. revisada_at: la última vez que alguien abrió la revisión de ese cliente. Mi día pide «Revisar las campañas de
--      <cliente>» cuando tiene 6 días o más (el curso: optimizar cada 5 a 7 días). Null = nunca.
--   2. alertas: lo GRAVE que miró el cron ese día (una campaña activa que no gastó, un anuncio rechazado, el doble del
--      número mágico gastado sin una conversación): `{ fecha, claves, error? }`. Con la fecha de hoy, el cron no
--      vuelve a mirar ese cliente; con las claves, lo que ya se avisó no se repite cada día.
--
-- Nada de lo que hay se toca: una columna que admite null y otra con valor por defecto. Las escribe
-- worker/lib/revision3q.js con `actualizar` (sólo las que nombra), así no pisa el informe ni los números del negocio.
-- ============================================================

alter table anuncios_clientes add column revisada_at text;
alter table anuncios_clientes add column alertas text not null default '{}' check (json_valid(alertas));
