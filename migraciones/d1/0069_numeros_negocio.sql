-- ============================================================
-- Los NÚMEROS DEL NEGOCIO de cada cliente (curso de campañas, entrega 3)
--
-- Dos columnas en `anuncios_clientes` (0041), que ya es «lo que decide la
-- agencia de los anuncios de un cliente» y ya está declarada en la capa de
-- acceso con su `client_id`:
--
--   1. negocio: el perfil (tipo de negocio, destino, cuenta nueva o con
--      historial), el modo del equilibrio y cada número (ticket, costos
--      variables, ITBMS, devoluciones, fijos, ventas de otros canales,
--      presupuesto, meta, % a invertir, tasa de cierre) con su ORIGEN:
--      cliente, agencia, estimado (lo propuso la IA, sin confirmar), meta
--      (leído de Meta) o medida (el enlace de ventas). Lo limpia
--      src/lib/numerosNegocio.js (`limpiarNegocio`) antes de escribirlo.
--   2. etapas: id de campaña de Meta → etapa del ciclo de ventas
--      (src/lib/cicloVentas.js), para las campañas cuyo nombre no sigue la
--      nomenclatura. La escribe la revisión de las campañas (entrega 5);
--      aquí sólo nace la columna.
--
-- Nada de lo que hay se toca: dos columnas con valor por defecto. Las
-- escribe sólo PUT /api/anuncios/clientes/<c>/negocio (worker/lib/negocio.js);
-- `guardarAjustesInforme` escribe otras columnas de la misma fila y, como el
-- upsert sólo cambia las que nombra, no las pisa.
-- ============================================================

alter table anuncios_clientes add column negocio text not null default '{}' check (json_valid(negocio));
alter table anuncios_clientes add column etapas text not null default '{}' check (json_valid(etapas));
