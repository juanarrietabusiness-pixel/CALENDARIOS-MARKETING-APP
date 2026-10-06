-- ============================================================
-- Las fechas especiales de cada cliente
--
-- El catálogo (feriados de Panamá, comerciales, días internacionales)
-- vive en el código (src/lib/fechasEspeciales.js) y sale solo en el
-- calendario de todos. Lo que cada cliente decide encima —cuáles le
-- importan, cuáles no quiere ver y las suyas propias (su aniversario, los
-- días de su rubro)— va en esta columna JSON. Es del CLIENTE y no del mes:
-- casi todo se repite cada año, y así se escoge una vez.
-- ============================================================

alter table clients add column fechas_especiales text check (fechas_especiales is null or json_valid(fechas_especiales));
