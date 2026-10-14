# El Estudio: la pieza individual primero, el lote después

Propuesta acordada con la agencia el 14-10-2026. Sustituye lo que quedaba pendiente del lote de anuncios
(`docs/propuesta-estudio-y-meta.md`) en lo que toca a calidad, fases y formatos.

## El principio

**El lote es el sistema individual repetido.** Si una pieza hecha a mano en el calendario sale profesional, el lote
sale igual porque llama a lo mismo. Por eso el orden es: primero el post, el carrusel y el reel INDIVIDUALES (desde
una publicación del calendario y desde el Estudio); después el lote y el mes completo, que sólo los encadenan.

## Cómo trabaja hoy la agencia (fuera de la aplicación)

- **Post:** con Flow (Nano Banana), con referencias de estilo; el modelo ha ido aprendiendo el kit de cada marca.
- **Carrusel:** la aplicación da la idea y el guion por láminas; se exporta y se lleva a Flow, un guion a la vez.
  Flow lo analiza y hace una **contrapropuesta** que entiende mejor quien lo va a generar, y crea todas las
  láminas con el texto escrito, el mismo estilo y, si hay, el mismo personaje en todas. Si una lámina sale con un
  error (una letra, «en ca / cada etapa»), se corrige SÓLO esa. Claude Design es la última opción: sin imágenes,
  parece una plantilla.
- **Reel de 10 s:** se le da la promoción, el beneficio o la idea central; Flow propone el guion de 10 s; luego
  **de 4 a 8 fotogramas** de lo que se verá (para revisar estilo, personajes e historia ANTES de gastar en el
  video); si gustan, se hace el video. Lo mejor de Flow: **corregir un tramo** («en el segundo 3, que…») sin tocar
  nada más. También aquí se dan referencias y estilos.

Lo que enseñan las muestras (Baby Caleb, Nateen, KMT, D'Casa):

- Posts y láminas: fotografía cálida de alto nivel, texto integrado con jerarquía (serif grande, apoyo pequeño,
  iconos de línea), mucho aire, la paleta de la marca en objetos y fondos. Cada lámina con una composición distinta.
- Carrusel narrativo: el MISMO personaje (el bebé pelirrojo con su traje) en todas las láminas.
- Reels: varios planos en 10 s (no una sola toma), texto corto en pantalla bien diseñado, precio exacto en una caja,
  y un cierre con logo y WhatsApp. Uno es pura tipografía animada (D'Casa, Black Week). Con audio.

## Lo que ya se decidió

1. **Tipo de pieza antes de la idea**, y el **estilo visual aparte**. El tipo dice QUÉ comunica (guía «Dame ideas»,
   «Mejorar idea» y una frase corta del pedido); el estilo dice CÓMO se ve. Estilos: Fotográfico, Diseño gráfico,
   Natural (celular), Editorial premium, Producto en estudio, Corporativo, Creativo y los propios de cada cliente
   (los propios que describen un aspecto pasan a estilos; los que describen un mensaje siguen siendo tipo). Cada
   tipo trae su estilo por defecto (Contenido humano → Natural) y el cliente puede guardar el suyo por tipo. Las
   referencias del tipo y los «Me gusta» viven en el bloque de estilo. Las líneas visuales de las 7 maletas (sello,
   antes y después, tarjeta) pasan a ser composición sugerida.
2. **Modelos de Kie** (documentación en `docs/kie/`): video — Kling 3.0 y Kling 3.0 Omni, Seedance 2.0/2.5, Veo 3.1
   (Fast y Quality, por su propia ruta), Gemini Omni 1.1 Flash y Omni Video, Hailuo 2.3, Wan 2.7; imagen — Ideogram
   V3, GPT Image 2.5, Nano Banana 2.1, Seedream 5.0 Pro, Imagen 4 Ultra; acabado — Topaz Image Upscale y Recraft
   Crisp Upscale (y quitar fondo).
3. **La calidad es el acabado, no el kit.** No hay revisión automática contra el kit. En su lugar:
   - cada estilo visual lleva su línea de acabado profesional (luz, lente, tratamiento del color, jerarquía
     tipográfica) en una o dos frases;
   - el texto lo diseña el modelo con jerarquía, con los modelos que mejor escriben;
   - alta resolución (2K/4K) cuando el modelo la tiene;
   - «Pulir al final» (opcional): ampliar y limpiar la escogida con Topaz o Recraft. **Se quitó después**: la agencia no le encontró uso.
4. **El mes en fases:** después de escribir las ideas, «Llevar sólo las ideas al calendario» (con «Qué se ve»,
   título, brief, texto en la pieza, descripción, tipo y matriz; pendientes, aprobación de idea) o «Crear los
   diseños». La publicación guarda la escena (`escena`, «Qué se ve») para diseñarla después con el mismo camino.
5. **Formatos:** Post, Carrusel y Reel con IA de 10 s, en lo individual y en el lote.

## Por qué el lote salía peor (diagnóstico)

- Escribía hasta 30 piezas en una llamada (Dame ideas escribe 6).
- «Mejorar idea» en el lote no veía el texto; después se pegaban frases fijas iguales para todo el lote
  (composición, «Fondo de color pleno…») que chocaban con la escena mejorada.
- En modo «plantilla» el texto lo dibuja la aplicación encima con una banda o un degradado: es lo que se ve básico.
- Le faltaba lo del individual: acabado, «Me gusta» como estilo, la composición de las referencias del tipo.

Arreglo: UN solo camino para armar una pieza (`armarPieza`), que usan el compositor, el lote, el mes y «Producir el
mes»: escena + texto → «Mejorar idea» (el brief como contexto, la composición como sugerencia DENTRO de la idea) →
tipo + estilo visual con su acabado + referencias (producto, tipo, «Me gusta», personajes) + logo → motor. Ideas de
6 en 6, sin frases fijas de fondo, la IA escribe el texto por defecto. Un test exige que la misma idea dé el mismo
pedido por las dos puertas.

## El carrusel individual (como en Flow)

1. **Guion por láminas** (ya existe: «Crear carrusel con IA», `partirGuion`).
2. **Contrapropuesta del director de arte** (nuevo, texto): la IA lee el guion, el tipo, el estilo y el kit y
   devuelve, lámina por lámina, qué se ve, el texto EXACTO y su jerarquía, y la composición — distinta en cada una,
   con el mismo hilo visual. Se edita antes de gastar.
3. **Las láminas, en orden:** la portada primero; cada lámina con la portada, la anterior, los personajes y las
   fotos del producto de referencia (ya existe la cadena). Texto por el modelo (por defecto) o plantilla.
4. **Corregir una lámina** (nuevo): «Corregir esta» con una indicación («cambia "en ca" por "en"») hace una edición
   que conserva todo lo demás (`promptDeEdicion`), y «Rehacer esta» la vuelve a pedir.

## El reel individual de 10 s (como en Flow)

Con **Gemini Omni 1.1 Flash por Kie** (`docs/kie/video.md`), que tiene justo lo que hace Flow:
`image_urls` hasta 7 imágenes «para personajes, escenas, estilos o storyboards»; `video_list` para partir de un
video (corregir un tramo de hasta 10 s); `character_ids` (personajes guardados) y `audio_ids` (voz guardada);
`duration` 4/6/8/10, 9:16 o 16:9, hasta 4K.

1. **La idea central** (promoción, beneficio o idea) → **guion de 10 s** con varios planos (ya existe el guion de
   10 s en tres tiempos; se amplía a planos con su texto corto en pantalla, el precio exacto y el cierre con logo y
   WhatsApp).
2. **Storyboard: de 4 a 8 fotogramas** (nuevo): uno por plano, con el modelo de imagen y las mismas referencias, en
   orden (como las láminas). Se revisan y corrigen uno a uno ANTES de pagar el video.
3. **El video:** Omni con los fotogramas (hasta 7) como storyboard, los personajes y el guion. 10 s, 9:16.
4. **Corregir un tramo** (nuevo): «Del segundo 3 al 5: …» manda el video hecho en `video_list` con la indicación;
   sale un video nuevo y el anterior se queda en la galería.

Con Kling 3.0 / Kling 3.0 Omni como alternativa (10 s, referencias e imagen inicial).

## Personajes y voz de la marca (nuevo, en el kit)

El bebé de Baby Caleb es un PERSONAJE: debe ser el mismo en todas las láminas y todos los reels. El kit guarda
personajes (nombre, descripción, retrato y cuerpo de la galería). En imagen van como referencias («cópialo tal
cual»); en Omni se registran con `gemini-omni-character` y se guarda su `character_id`. Igual una voz de marca
(`gemini-omni-audio`) para las narraciones.

## Orden de trabajo (un PR cada uno)

1. **Kie:** los modelos de video e imagen de arriba, Upscale, Omni con storyboard/edición, personajes en Omni.
2. **Compositor:** tipo de pieza antes de la idea, estilo visual aparte (con su acabado y estilos propios).
3. **La pieza individual de calidad:** el camino único `armarPieza`, alta resolución, «Pulir al final».
4. **Carrusel individual:** contrapropuesta, láminas con personajes, corregir una lámina.
5. **Reel individual:** guion por planos, storyboard de 4–8 fotogramas, video con Omni, corregir un tramo.
6. **El lote y el mes:** las ideas de 6 en 6, fases (sólo ideas al calendario), formatos post/carrusel/reel,
   todo llamando a 3, 4 y 5.

Nada de Kie se ha probado contra el servicio real: la forma sale de su documentación. Lo primero con la llave es una
imagen barata, luego un Omni de 4 s, y después uno de 10 s con storyboard.
