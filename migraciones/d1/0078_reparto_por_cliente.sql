-- ============================================================
-- El REPARTO del presupuesto por etapa, A MANO para un cliente
--
-- El estándar de la agencia vive en el Manual de campañas (60/20/10/10 por defecto). A un cliente se le puede
-- repartir a mano (más a Presentación, por ejemplo): se guarda aquí, en % por etapa ({ presentacion, evaluacion,
-- conversion, ascension }, que suma 100), y se queda para los meses siguientes hasta «Volver al estándar» (null).
-- Lo leen el plan de campañas, los números del negocio y el Excel de estrategia (`repartoDelCliente` en
-- src/lib/manualCiclo.js). Se escribe con `actualizar` y sólo esta columna: la fila tiene muchos dueños.
--
-- Nada de lo que hay se toca: una columna vacía.
-- ============================================================

alter table anuncios_clientes add column reparto text;
