-- ============================================================
-- CREAR IMÁGENES SIN PREGUNTAR (Ajustes → IA)
--
-- Hasta aquí toda imagen desde 0,50 $ pedía un segundo «sí» (409 `confirmar` en el servidor, la tarjeta del plan en el
-- chat, el «¿Sigo?» del panel). La agencia pidió poder dejarlo FIJO: que con el modelo de cada cliente no pregunte, y
-- que pregunte sólo si el asistente sugiere OTRO motor o el pedido pasa de un tope.
--
--   sin_preguntar_usd: el TOPE por pedido en US$. Nulo o 0 = apagado (como antes: se pregunta). Mayor que 0 =
--   encendido: una IMAGEN (pieza suelta, tanda del director, carrusel, historias, otra versión, corregir, recrear, el
--   lote) con el modelo del cliente y que no pase de esta cifra se crea sin preguntar. Video, voz y música siguen
--   preguntando siempre, y el presupuesto del mes («detener») sigue mandando.
--
-- Lo cambia sólo el administrador (PUT /api/ajustes, como el presupuesto); lo lee `leerConfigIA` (worker/lib/configIA.js)
-- y la regla está en src/lib/sinPreguntar.js (la misma para el Worker y la pantalla).
--
-- Una columna con valor nulo por defecto: nada de lo que hay se toca. Va en su columna y no dentro de `ia_modelos`
-- (cuyo CHECK sólo pide JSON): así el tope se valida en la base.
-- ============================================================

alter table ajustes_espacio add column sin_preguntar_usd real check (sin_preguntar_usd is null or (sin_preguntar_usd >= 0 and sin_preguntar_usd <= 1000));
