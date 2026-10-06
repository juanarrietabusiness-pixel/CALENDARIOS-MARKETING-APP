-- ============================================================
-- El kit de marca de cada cliente, para el Estudio
--
-- Paleta (con el papel de cada color), tipografía, estilo, luz, lo que
-- nunca debe salir, el logo original (clave de R2 de ESTE cliente) y los
-- cuatro presets —producto, anuncio, corporativo, creativo— que van
-- delante de cada idea. Lo prepara la IA desde el cerebro y lo guarda una
-- persona (worker/lib/estudio/kit.js; lo puro en src/lib/kitMarca.js).
--
-- No viaja en el guardado de la ficha (`clientToRow` no lo lleva): sólo lo
-- escribe el Estudio, así una ficha abierta desde antes no lo pisa.
-- ============================================================

alter table clients add column kit_marca text check (kit_marca is null or json_valid(kit_marca));
