-- ============================================================
-- Qué redes entran en el informe mensual de cada cliente
--
-- Antes entraba TODO lo conectado: un cliente con TikTok de prueba lo veía en
-- su informe. Ahora se escoge al generarlo y, con «Recordar para este
-- cliente», queda aquí y lo usa también el informe automático del día 1.
-- JSON { "redes": ["instagram","facebook",…], "anuncios": true|false }
-- (src/lib/informeRedes.js). Vacío = todo, como antes.
--
-- Va en su columna y no la escribe `clientToRow`: sólo la toca la pantalla de
-- informes, así una ficha abierta desde antes no la pisa.
-- ============================================================

alter table clients add column informe_redes text check (informe_redes is null or json_valid(informe_redes));
