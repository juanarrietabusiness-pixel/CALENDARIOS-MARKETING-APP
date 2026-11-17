# Trampas conocidas · Video, voz y sonido

**Qué cubre:** El reel por planos, el video animado (formato, motor, render en el Container), la voz (ElevenLabs, Kie), la música (Suno, director musical, biblioteca de sonido), «con tu canción», «publicar con música», estilos de video.

**Cuándo leerlo:** Antes de tocar `src/lib/motorVideo.js`, `videoEscenas.js`, `worker/lib/estudio/render.js`, `container/`, la voz o la música.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- **Quién VE los videos se escoge** (Ajustes → IA → «Ver videos», `ia_modelos.video`, `motorDeVideo`): Gemini con la
  llave de siempre, Gemini con `GOOGLE_AI_KEY_GRATIS` (nivel gratuito: se apunta a costo 0; Google puede usar lo que
  recibe y tiene topes, y el 429 lo dice así) o Meta. Meta NO recibe video: `verVideo` contesta 409
  `codigo: "fotogramas"` y el navegador los saca (`conFotogramas` en db.js) y repite el pedido; sin audio, sin
  transcripción. `agregarReferencia` NO guarda la referencia en ese 409 (si no, el reintento la guardaría dos veces).
  **La llave gratuita daba 404 y la de pago no:** Google dejó los 2.5 sólo para los proyectos que ya los usaban, y la
  llave gratuita suele ser de un proyecto nuevo. Con un 404 al analizar, `verVideo` pregunta a `/v1beta/models` qué
  tiene ESA llave (`elegirModeloVideo`: Flash estable más nuevo, sin imagen ni voz) y repite. El video ya subido vale.
- **El video va LIMPIO: a un modelo de video nunca se le pide texto, subtítulos ni logo** (`SIN_TEXTO_VIDEO` en
  `src/lib/videoLimpio.js`, decisión de la agencia: escriben mal y deforman el logo). Una sola frase que usan
  `LINEA_VIDEO` (todo video del compositor), el Reel IA (guion, fotogramas, video, Flow, tramo), el guion corto, el lote
  y el recreador. El guion del reel ya no trae `texto` por plano; uno de antes que lo traiga se lee y se ignora.
- **«Video del producto» es una RECETA: termina en la foto real y el logo real porque no los dibuja el modelo de video**
  (`src/lib/videoProducto.js`, `videoProductoEstudio.js`, `FlujoVideoProducto.jsx`, `POST /api/estudio/<c>/video-producto/guion`;
  salió de una prueba con Baby Caleb y MiniMax H3 que la agencia aprobó). Producto del catálogo CON fotos → guion (primer
  fotograma, tres tramos, cámara, locución y música) → el primer fotograma SIN logo y el cierre con las fotos del producto
  y el logo del kit (o estampado), por el camino de una pieza (`pedidoDePieza`) → el video con imagen inicial Y final
  (`sirveParaProducto`; `PREFERIDOS_PRODUCTO` empieza por MiniMax H3). Cosas que no se ven:
  · **La voz va ESCRITA entre comillas en el pedido** (`promptDeVideoProducto`): sin ella, H3 se inventó una locución en
  otro idioma. Seedance y Wan van sin voz (`sinVozEnProducto`). El prompt es CORTO (`MAX_PROMPT_VIDEO_PRODUCTO`) y describe
  el movimiento por segundos, no lo que ya se ve: reglas del método público de Higgsfield (MIT, `docs/licencias/`).
  · **El primer fotograma no lleva logo**: el video lo arrastraría deformado. El cierre lleva el logo el ÚLTIMO (las fotos
  dejan su hueco, `fotosParaFotograma`).
  · **Vive DENTRO de FlujoReel** («Video» → «Guiado» → «Del producto», `FORMAS`): el chunk del Estudio está en su tope y una
  forma nueva en el compositor no cabía. En una publicación de reel o historia, «Video del producto» abre `ReelIA` con
  `forma="producto"`; el caption que escribe sólo RELLENA el del post.
  · **El asistente y Claude (MCP) siguen la misma receta**: `ver_estudio` la explica (`RECETA_VIDEO_PRODUCTO`) cuando el
  catálogo tiene fotos, `crear_en_estudio` acepta `sin_logo` para el primer fotograma y su tope de video es 15 s (lo frena
  la confirmación de 0,50 $). Atajo del director: «Video de un producto».
- **El Reel IA saca dos cosas de los fotogramas** (FlujoReel.jsx): «Un solo video con todo» (el storyboard, listo para
  subir) o «Un clip limpio por fotograma» (`pedidoDeClip`/`crearClips` en lib/reelEstudio.js): cada fotograma es la
  imagen inicial de su clip, SIN texto, voz ni música (`sonido: "no"`), todos a la vez, y se bajan en un ZIP numerado por
  plano para CapCut — el método de la agencia en Flow. 15, 20 y 30 s salen en UN video por API con Seedance 2.5 por Kie
  (`DURACIONES_REEL`; `soloFlow` es sólo 40 s); en 30 s caben 12 planos. Seedance y Wan van SIN voz (`sinVozPropia`:
  la inventan mal en español): el pedido dice «sin voz ni diálogo» y la locución del guion no se les manda.
- **La voz de la marca es del kit** (`kit.voz`, una de `VOCES_OMNI`; el servidor descarta otra). Arranca el Reel IA y el
  compositor al escoger Omni. «Escuchar» (`GET /api/estudio/<c>/voz/<voz>`, worker/lib/estudio/voz.js) pide a Google
  una frase con esa voz por su texto a voz —las voces de Omni son las de Google— con la MISMA `GOOGLE_AI_KEY`, y la
  guarda en R2 bajo `voces/` (no `clientes/`): cada voz se paga una vez para toda la agencia. Google devuelve PCM en
  crudo y se le pone la cabecera WAV (`wavDePcm`). Si la llave no tiene el primer modelo de voz (404), prueba el
  siguiente (`MODELOS_VOZ`). Pasa por `bloqueoPorPresupuesto` y `registrarConsumoGemini`. **No se ha probado contra
  Google real.**
- **El director comercial de los videos** (`src/lib/directorVideo.js`, `worker/lib/estudio/director.js`). TODO guion de
  video (Reel IA, recrear un anuncio) lleva el CRITERIO COMERCIAL de la agencia (`lineaDelDirector`): gancho visual en 2
  s, problema antes que producto, un beneficio, nada inventado, llamado a la acción… Se edita en Ajustes → Manual de
  campañas → «Criterio comercial de los videos» (`manual_campanas.video`: dentro del manual, sin migración); vacío vale
  `MANUAL_VIDEO_BASE`. «Revisar como director comercial» del Reel IA (`POST /api/estudio/<c>/director`, función
  «director comercial») devuelve la idea mejorada y qué cambió y por qué; nada cambia hasta «Usar esta». El criterio se
  lee a mano en director.js y no con `leerManual` de estratega.js: estratega.js importa mercado.js, y mercado.js usa
  director.js (sería circular).
- **Recrear un video: dos modos y el motor lo propone una REGLA** (`MODOS_RECREAR` en lib/recrear.js,
  `motorParaRecrear` en lib/motorRecrear.js). «Mismo video, con mi producto» edita el original (Omni por Kie, con 5
  fotos del producto como mucho); «Otra versión que transmita lo mismo» hace uno nuevo SIN el original, por tramos, a la
  duración de la referencia (Seedance 2.5 llega a 30 s). La regla recorre una lista de preferencia y se queda con el
  primero CON LLAVE: la IA no escoge, así no puede proponer lo que no hay. Las fotos del producto van también en video
  (antes `video ? [] : …` las vaciaba). «Otra versión» llama a `…/adaptar` con `antes` y `pide`, sin volver a analizar,
  y un anuncio ya analizado (está en las referencias del estudio de mercado por su `archivoId`) no se paga otra vez.
  Seedance y Wan van SIN voz (la inventan mal en español): música y sonido ambiente.
- **El reel con IA de 10 s es un flujo de cuatro pasos** (`components/FlujoReel.jsx`, lazy; «Reel IA» en «Qué crear» del
  Estudio y «Crear reel con IA» en una publicación de formato reel, `calendario/ReelIA.jsx`). Como en Flow: (1) la idea
  central → guion por planos (`POST /api/estudio/<c>/reel/guion`, `pedidoDeReel`/`leerReel` en src/lib/reel.js: de 4 a
  8 planos con su tiempo, qué se ve, texto corto en pantalla y cámara; hilo, sonido y descripción; los tiempos los
  deja contiguos `repartirTiempos`); (2) los planos se corrigen; (3) un FOTOGRAMA por plano (imagen 9:16, en orden,
  con el anterior, el primero y los personajes de referencia, `crearFotogramas`), que se corrigen o rehacen ANTES de
  pagar el video; (4) el VIDEO con los fotogramas como storyboard (`pedidoDeVideo`: Omni por Kie admite 7, repartidos
  por `fotogramasParaVideo`; un modelo sin referencias recibe el primero como imagen inicial). «Corregir un tramo» manda
  el video hecho como video de referencia con «del segundo X al Y: …» (`corregirTramo`, `promptDeTramo`; sólo con un
  modelo que admita video: Gemini Omni o Kling Omni por Kie) y la versión nueva sale arriba, la anterior se queda.
  Todo va en la carpeta del reel. Los `character_ids` de Omni (personajes registrados) aún no se usan: los personajes
  van como imágenes de referencia en los fotogramas.
- **El Reel IA: 10 s con Omni u 8 s con Veo, y el sonido en el MISMO pedido** (`DURACIONES_REEL`, `ajustarDuracion`,
  `locucionQueCabe` en src/lib/reel.js). Cambiar la duración reparte los planos en el tiempo nuevo (cada uno conserva su
  proporción) sin escribir el guion otra vez; Veo con fotogramas usa 3 de referencia. El guion trae `musica`,
  `locucion` (como mucho 2,5 palabras por segundo) y `efectos` —uno de antes con todo en `sonido` se lee como música— y
  `promptDeReel` los dice por separado: generar el audio aparte y montarlo después no casa la voz con los planos. La
  VOZ de Omni por Kie es un ajuste del modelo (`voz`, `VOCES_OMNI`: 30 voces fijas, el idioma lo da el texto): `enviar`
  la REGISTRA (`/api/v1/omni/audio/create`, gratis) y manda su id en `audio_ids`; con imagen inicial Kie no la admite
  (`validarKie`). Un modelo sin voz pone la suya. La música de tendencia de Instagram no va por API.
- **El video se hace en FLOW: «Copiar para Flow» es lo principal** (`promptParaFlow`, `clipsDelGuion` en src/lib/reel.js;
  FlujoReel). La agencia usa Gemini Omni en Flow y le da el guion entero al agente en UNA instrucción; por API salía caro
  y peor. El prompt lleva todo lo que Flow no sabe: la marca (`bloqueDeMarca`), el estilo, la continuidad (hilo,
  personajes, producto con su precio), cada clip con sus planos, cámara y texto en pantalla exacto, la música, la
  locución y los efectos, y qué imágenes subir como ingredientes (logo, retratos, foto del producto). **20, 30 y 40 s son
  sólo para Flow** (`soloFlow`, `DURACIONES_REEL` con `soloFlow: true`): clips de 10 s (`SEGUNDOS_POR_CLIP`) que el agente
  genera seguidos; el guion pide que ningún plano cruce un múltiplo de 10 s y admite hasta 5 planos por clip
  (`maxPlanos`). «Crear aquí por API» (fotogramas y video) sigue para 8 y 10 s, como opción secundaria. El guion puede
  seguir un ANUNCIO QUE YA FUNCIONA (`referenciaId` en `POST …/reel/guion`: el servidor toma la estructura, el gancho y
  por qué funciona de la referencia analizada del estudio de mercado; su forma, nunca su marca ni su texto). En «Qué
  crear» hay UN chip «Video» y debajo sus dos formas: «Con guion» (el guiado, FlujoReel) y «Clip rápido» (el
  compositor de un prompt). Eran dos chips sueltos y no se entendía cuál era cuál.
- **Videos cortos: una idea en tres tiempos** (`src/lib/videoCorto.js`, `worker/lib/estudio/guionCorto.js`,
  `POST /api/estudio/<cliente>/guion-corto`). Los modelos de la agencia hacen 8 s (Veo por fal.ai) o 10 s (Gemini Omni Flash —el
  «Omni» de Flow, con la llave de Google— o Kling Omni, por Higgsfield, `kling-omni` en el generador): la duración la decide el MODELO (`segundosParaModelo`), y al usar el
  guion se pone su duración en el ajuste. El guion lleva como mucho CUATRO palabras en pantalla —los modelos de
  video escriben mal— y lo demás va en «textoEdicion»; el logo tampoco se le pide al modelo. Desde una
  publicación viajan su tipo y su producto (con el precio del catálogo). Es texto: no gasta en el motor.
- **Veo 3.1 de Google ya no está: Google lo retiró de la API de Gemini el 22-10-2026** (`veo-3.1`, `-fast`, `-lite`,
  todos `-preview`; su versión final sólo existe en la plataforma empresarial, con otra cuenta). El video de Google por
  defecto es **Gemini Omni Flash** (`predeterminado`); Veo sigue por fal.ai. Los ids viejos viven en `MODELOS_RETIRADOS`:
  la galería y el visor los nombran «(retirado)» (`nombreDelModelo`), `validarPedido` y un pedido que quedó a medias
  dicen por qué y qué usar (`retirado()`), y «Pedir otra igual» cae en el predeterminado de su tipo. Un test falla si
  vuelve un video de Google con id `-preview`. El motor de Google ya no habla `predictLongRunning`.
- **Gemini Omni Flash no es Veo** (`gemini-omni-flash`, `api: "interactions"` en el catálogo; `peticionOmni`,
  `videoDeInteraccion` en worker/lib/estudio/motores.js). Va por `POST /v1beta/interactions` con la MISMA llave de
  Google, pide el video por dirección (`delivery: "uri"`: en línea no cabe uno de más de 4 MB) y puede contestar ya
  con él o seguir en marcha (se mira `GET /interactions/<id>`). La duración NO es un parámetro de la API: va en el
  prompt; si el prompt no la trae (los tiempos del guion de 10 s ya la traen), se le añade «Duración total: N
  segundos». Por REST el video está en `steps[]` → `content[]` de tipo «video» (`output_video` es del SDK). La
  dirección se baja con la llave sólo si es de `*.googleapis.com`. No acepta fotos con personas reconocibles.
  **Nada de Omni se ha probado contra Google**: la forma sale de su documentación y los tests usan un `fetch` de
  mentira.
- **El video animado: un guion de ESCENAS en JSON, anclado a PALABRAS** (`src/lib/videoEscenas.js`, `videos_proyectos`,
  0059; el formato con su ejemplo, en `docs/formato-escenas-v1.md`). Fase 1: formato, validador y tabla; el motor de
  Canvas 2D, la voz (ElevenLabs v3 por KIE, v2 de respaldo) y la pantalla vienen después. Cosas que no se ven:
  · **El habla de todas las escenas, en orden, ES la locución** (una toma). La escena empieza en su primera palabra y una
  capa entra «en la palabra n» de su escena: cambiar de voz vuelve a cuadrar todo. `palabrasDe` cuenta las palabras igual
  que la alineación (sin las `[emociones]` de v3 ni los signos sueltos); si los tiempos de la toma no cuadran con esa
  cuenta, `lineaDeTiempo` estima (2,5 palabras/s) y lo dice (`estimado`).
  · **Una `pausa` es un silencio que el render INSERTA en el audio** (`silencios`, en tiempo del audio): con una sola
  toma, una escena muda no existe de otra forma. Una escena de menos de `MIN_ESCENA` también se alarga con silencio.
  · **`validarGuion` no arregla en silencio**: un texto largo, un color que no es token ni #RRGGBB o una palabra que la
  escena no dice son errores con `donde`; lo que no es del formato se quita con aviso. Un test valida el ejemplo del
  documento: si cambia el formato y no el documento, falla.
  · **El CHECK de `estado` es `ESTADOS_VIDEO`, con los de la fase 2 ya dentro** (cambiar un CHECK es reconstruir la
  tabla). La locución sólo se genera con `version` = `aprobada_version` (`puedeGenerarVoz`): editar después de aprobar
  vuelve a borrador.
  · **`videos_proyectos` señala la publicación por «calendario + publicación»**, así que viaja con ella al moverla de mes
  (`trasladarPublicacion`, ya son siete tablas).
  · **El MOTOR es uno para la vista previa y el render** (`src/lib/motorVideo.js`, paso 2). No crea lienzos, no carga
  nada y no lee la hora: lo de cada entorno entra por `recursos` (imágenes ya cargadas, logo, textura del grano) y
  `fuentes` (familias ya registradas); en el navegador lo prepara `motorVideoNavegador.js`. Es DETERMINISTA —lo
  aleatorio sale de `semilla`, y el grano cambia por FOTOGRAMA, no por reloj— y dibuja en las medidas del formato (1080
  × 1920): quien llama escala el contexto. Un test con un lienzo de mentira lo vigila, y otro busca `document.`,
  `Math.random` o `Date` en el archivo: con ellos el render del Container no daría lo mismo que la pantalla. Lo que aún
  no dibuja (teléfono, burbuja, personaje, icono, cifra, lista, reloj, antes y después: paso 7) sale como MARCADOR con
  su nombre (`COMPONENTES_LISTOS`), así un guion válido nunca rompe la vista previa.
  · **La paleta sale del KIT por PUNTAJE, no por la primera palabra que case** (`paletaDelKit`, `PISTAS`). La primera
  versión buscaba «texto» en el papel y, con el kit REAL de Baby Caleb, el texto salía BEIGE («Fondo principal alterno —
  base limpia para texto») y el acento SAGE («acento natural suave» le ganaba a «…CTA»). Ahora lo que el papel dice
  antes de la primera raya o barra pesa el triple, un CTA gana a un «acento» a secas y el texto TIENE que leerse sobre
  el fondo (4,5 a 1). Un test lleva los 7 papeles reales tal cual. Lo que fija el guion manda encima (`paletaDelGuion`),
  y un texto sobre su placa que no llegue a 3 a 1 usa el claro u oscuro que más contraste (`colorLegible`). En texto y
  acento, la PRIMERA palabra del papel desempata (`PRIMERA_DECIDE`): con el kit de 57DMC el dorado («acento principal:
  logo, títulos…») empataba con el blanco («texto y contraste…») y salía de texto, y las palabras clave, en blanco.
  · **El MOTOR reparte por zonas; el guion no pone coordenadas** (`repartirEscena`, `areaSegura`, `bandaDeSubtitulos`).
  Con puntos fijos por nombre, la placa del texto tapaba la foto del producto y el tercio de abajo quedaba vacío. La
  zona de una capa dice su ORDEN; el motor la mide con el MISMO código que la dibuja (`medirCapa` pasa `dibujarCapa`
  por un lienzo que sólo mide: no pueden discrepar) y reparte el alto del área segura (9:16: 12 % arriba, 20 % abajo y 9 % a cada lado
  libres) menos la franja de subtítulos. Una `forma` va detrás de la capa que la sigue; dos que no se ven a la vez
  comparten sitio; en 16:9 (el LIENZO, no la caja: en 1:1 la caja sin subtítulos es más ancha que alta) lo visual va en
  su columna. `cajasDeEscena` da las cajas para los tests, que exigen sin encimarse, dentro del área y usando el tercio
  de abajo en los tres formatos. En la primera escena algo entra antes de 0,3 s (`tiemposDeEscena`). La vista previa
  tiene «Zonas seguras» (lo pinta ENCIMA, no va en el video). Medido en Chromium (sin GPU): ~5,5 ms por fotograma a
  1080 × 1920.
  · **Lo que ve primero quien abre el video, y cómo se leen las placas** (ajustes del paso 2). En el gancho entra
  PRIMERO su texto principal (`textoPrincipal`, `tiemposDeEscena`: lo demás, `DESPUES_DEL_GANCHO` después): entraba el
  marcador del personaje y el titular a los dos segundos. Una escena sin texto, sello ni llamado dibuja su `pantalla`
  como titular (`capasDe`): la del problema enseñaba sólo un icono y una lista. Las líneas se reparten parejas y cortan
  en «·», comas y puntos (`partirEquilibrado`, recargo por cortar fuera de un separador): «Sin alcohol · sin / perfume»
  cortaba mal. Las imágenes se cargan SIN su borde transparente (`cajaOpaca` en el motor, puro; el recorte lo hace
  `motorVideoNavegador.js` y lo hará el gemelo del Container) y el logo del cierre mide al menos `MIN_LOGO_CIERRE` (la
  mitad del lado corto): un logo con mucho aire se veía diminuto. Con una posición `{ x, y }` en el guion, no: ahí el
  tamaño también es del guion (`anchoPedido(…, { fija: true })`) y el dueño de 57DMC quería el logo como un sello
  pequeño; antes todo `tam` por debajo de 0,5 daba lo mismo.
  · **El guion se valida también en el SERVIDOR** (`worker/rutas/videos.js`): lo que llega del navegador o de Claude no
  se cree, y con errores no se guarda (400 con cada error y su sitio). Guardar y aprobar llevan la `version` que se
  leyó: si otra persona guardó entremedias, 409 (`actualizar` con la versión como condición). Aprobar fija
  `aprobada_version`. Evento `videos` → `window`.
  · **La pantalla vive DENTRO de FlujoReel** («Video» → «Guiado» → «Animado con código»), en su chunk: el del Estudio
  está en su tope. `rendimiento.bundle.test.js` le pone 25 kB y prohíbe Remotion, Lottie y PixiJS: una librería del
  navegador aquí rompería el render, no sólo el peso. La vista previa es GRATIS: tiempos estimados hasta que haya voz,
  sin sonido ni subtítulos todavía (pasos 3 y 4).
  · **La voz (paso 3) es un TRABAJO del Estudio de `tipo: "audio"`** (`worker/lib/estudio/locucion.js`, `src/lib/voces.js`;
  rutas `/api/videos/<c>/voces`, `…/voces/muestra` y `…/<id>/locucion`; herramientas `listar_voces`, `previsualizar_voz` y
  `generar_locucion` para el asistente y el MCP). Va por la MISMA cola de Kie que un video (createTask → recordInfo →
  bajar), la avanza la bomba y se cobra al entregarla. `estudio_trabajos.tipo` no tiene CHECK: no hizo falta migración.
  Cosas que no se ven:
  · **SIEMPRE se confirma** (decisión de la agencia), aunque cueste centavos: la locución y la muestra contestan 409
  `confirmar` con el costo y los créditos hasta `confirmado: true` (el booleano). En el asistente vuelve como texto «NO SE
  CREÓ NADA…» con la cifra, como `crear_en_estudio`. Un segundo pedido mientras va el primero: 409 `en_curso`.
  · **Sólo del guion aprobado** (`puedeGenerarVoz`) y con la versión aprobada en el trabajo: si el guion cambia mientras
  se genera, la toma se guarda con `desfasada` y el video NO pasa a «Con voz».
  · **Los tiempos, en tres capas** (`tiemposDeLocucion`): los que traiga Kie (`palabrasDelResultado` lee listas de
  palabras y la alineación POR CARÁCTER de ElevenLabs; v2 se pide con `timestamps: true`); si no trae, Gemini OYE la toma
  y la transcribe con tiempos (`verVideo` acepta audio; se ALINEA con el guion por distancia de edición, y por debajo del
  85 % de coincidencia queda `revisar`); si no, se estiman sobre la duración REAL del MP3 (`duracionMp3`). Siempre UNA
  por palabra de `palabrasDe(textoDeLocucion(guion))`: con eso `lineaDeTiempo` deja de estimar.
  · **La muestra de una voz se paga UNA vez para toda la agencia** (`voces/elevenlabs/<v3|v2>/<id>.mp3`, fuera de
  `clientes/`): la segunda vez sale gratis y `listar_voces` dice cuáles ya están hechas.
  · **La muestra puede decir un texto PROPIO** (`texto`, hasta `MAX_TEXTO_MUESTRA` 500; `textoDeMuestra`): queda aparte de la
  frase fija con la huella del texto (`…/<voz>-<huella>.mp3`, `huellaDeMuestra`; el GET la pide con `huella`), y el mismo
  texto otra vez sale gratis. Toda toma —muestra y locución— apunta en la nota del trabajo si Kie devolvió el tiempo de cada
  palabra (`tiemposQueLlegaron`) y en `ajustes.tiempos` y `ajustes.crudo` (un extracto de lo que contestó Kie): es como se
  sabe la forma real de su respuesta sin adivinarla. «Probar una voz» (`ProbarVoz.jsx`, lazy, en «Animado con código»)
  escoge voz, modelo y texto, enseña el costo (el 409) y sólo con «Generar» la paga; luego la nota y el audio.
  · **El audio va a `estudio_archivos` con tipo «audio»** y la galería NO lo enseña (`leerGaleria`). `tipoPorBytes`
  reconoce MP3 (ID3 o cuadro) y WAV. La voz de la marca vive en `kit.locucion` (voz, modelo, hasta 12 voces propias por
  su id de ElevenLabs) y `fundirKit` la conserva.
  · **Kie sólo acepta las voces de SU lista** (66, por su id de ElevenLabs; `VOCES_DE_SERIE` lleva las comprobadas en su
  formulario). La primera prueba real con Matilda —de serie en ElevenLabs— volvió «Invalid voice parameter». La voz va por
  el ID en v3 y en v2 (`vozParaKie`); v3 lleva `language_code: "es"` (con «auto», una voz de acento inglés lee el español
  como extranjera) y v2 no (según Kie, sólo Turbo y Flash lo admiten). Una voz propia del kit tiene que estar en esa lista.
  · **Con la llave oficial (`ELEVENLABS_API_KEY`) la voz sale DIRECTO por ElevenLabs y Kie queda de respaldo**
  (`viaDeVoz` en locucion.js, worker/lib/estudio/elevenlabs.js): Kie dejó las tomas de v3 en espera hasta cortarlas («The
  upstream API service timed out»). La vía la decide el servidor por sus llaves y queda en el trabajo (`motor: "elevenlabs"`,
  `modelo: "elevenlabs-v3"`; por Kie, `elevenlabs-v3-kie`). Cosas que no se ven:
  · **ElevenLabs contesta en el acto, pero va por el contrato de COLA** para no tocar la cola: `enviar` genera la toma
  (`/v1/text-to-speech/<voz>/with-timestamps`) y la deja en R2 bajo `voces/pendientes/` (fuera de `clientes/`) con su
  alineación por carácter; `sondear` la entrega y `terminarAudio` la guarda (de los bytes, sin bajarla) y borra lo pendiente.
  · **Las voces son las de la CUENTA** (`/v1/voices`, `vozDeLaCuenta`): también las de la biblioteca añadidas a «My Voices».
  Si la llave no deja leerlas, las de serie (`VOCES_ELEVENLABS`). Oír una muestra hecha sólo pide un id con forma de
  ElevenLabs (`esIdDeVoz`): preguntar la lista en cada audio sería una llamada más.
  · **El costo es un crédito de ElevenLabs por carácter**, en dólares aproximado con el plan Creator
  (`USD_POR_CARACTER_ELEVENLABS`), y la confirmación lo dice. Sigue confirmándose SIEMPRE.
  · **Lo que no se puede comprobar sin gastar se pide con tolerancia** (`generarToma`): si rechaza `language_code: "es"` en
  v3, otra vez sin él; si rechaza los tiempos, el audio solo (los tiempos los pone la verificación o la estimación). Un
  rechazo no cobra. Sin créditos ElevenLabs contesta 401 `quota_exceeded`: se mira antes que la llave.
  · **Nada de ElevenLabs directo se ha probado contra el servicio real**: los tests hablan con un `fetch` de mentira.
  (Las primeras muestras reales de v3 con la llave oficial sí salieron, con el tiempo de cada palabra.)
  · **Eleven v4 (`eleven_v4`) es el modelo de partida, SÓLO por la vía directa** (`MODELOS_VOZ.v4`, `kie: null`). Si la
  cuenta lo tiene lo dice `/v1/models` (gratis, `modelosDeLaCuenta`, recordado 10 min por instancia; también da el
  factor de costo por carácter, `character_cost_multiplier`, que entra en la confirmación). `modeloParaVia` lo baja a v3
  por Kie o si la cuenta no lo tiene; si `/v1/models` no contesta, se intenta (un rechazo no cobra). Lleva
  `language_code: "es"` como v3, con el mismo reintento sin él. Su id salió de la documentación (octubre de 2026): la
  primera muestra real lo confirma.
  · **Las voces, en ESPAÑOL** (`vozDeLaCuenta`): ElevenLabs las describe en inglés («Roger - Laid-Back, Casual»); se quita
  el lema del nombre y se traduce con un diccionario (`TRADUCCION`, frases antes que palabras). Lo que no está en él se
  QUITA —salvo en una voz nativa en español, cuya descripción ya viene en español—: así no sale una mezcla de idiomas.
  Si una voz nueva sale sin nota, falta su palabra en el diccionario. Nativa = etiqueta de idioma «es», o que su ÚNICO
  idioma verificado sea el español (las de serie traen varios). Van primero (`enEspanolPrimero`).
  · **La biblioteca en español** (`/api/videos/<c>/voces/biblioteca`, `buscarEnBiblioteca`): `/v1/shared-voices` con
  `language=es` e `include_custom_rates=false` (una voz con tarifa propia costaría más de lo que dice la confirmación).
  «Añadir a mis voces» (`/v1/voices/add/<publico>/<voz>`) ocupa un hueco de la cuenta: sólo admin. Desde entonces sale en
  `/v1/voices` sola. Buscar, escuchar y añadir son gratis.
  · **«Escuchar gratis»** es la `preview_url` que publica ElevenLabs, servida por el Worker (`previaGratis`: la CSP no deja
  oír audio de otro origen) y sólo de `storage.googleapis.com` / `elevenlabs.io` por https (`previaDeVoz`), sin la llave.
  Las de serie suelen estar en inglés: para oírlas en español, la muestra pagada de siempre.
  · **La voz de la marca se fija desde «Probar una voz»** (`PUT …/voces/marca`, `fijarVozDeMarca`): sobre el kit GUARDADO,
  sólo `kit.locucion` (voz y modelo). No confundir con `kit.voz`, la voz de Google de los reels de Omni (VozDeMarca.jsx).
  · **Una voz que Kie deja «en espera» se da por fallida a los 12 minutos** (`PLAZO_AUDIO_MS`; el resto de trabajos, 30):
  la primera prueba real de v3 se quedó en `waiting` (en su panel, `running` y cobrada) y la pantalla cargaba media hora.
  El error dice en qué estado se quedó. Un 408 (sin resultado en 10 min) o un 501 (falló la generación) de Kie, en
  cualquier modelo, terminan el trabajo con su motivo y ya no se reintentan (`errorDeKie`).
  · **Claude trabaja el video por MCP** (`worker/lib/estudio/herramientasVideo.js`, también en el asistente):
  `formato_video`, `listar_videos`, `ver_video`, `crear_video` (con `publicacion_id`), `guardar_video`, `editar_escena`
  (cambia, mueve, añade o quita una escena; con `id` + `cambiar`, sólo unos campos sin mandarla entera; con `cambios`,
  hasta 20 en UNA versión, en orden y todos o ninguno: el error dice «Cambio n») y `aprobar_video`. Van por `worker/lib/videosProyectos.js`, el MISMO camino
  que la pantalla: el guion se valida en el servidor, la `version` leída evita pisar, editar devuelve a borrador.
  Aprobar es de la persona: la descripción le dice a Claude que sólo con su sí. Con eso `generar_locucion` ya tiene un
  video aprobado que nombrar. Ninguna gasta.
  · **«Ver un cuadro» es el CONTAINER, no el Worker** (el Worker no tiene lienzo; `container/`, `worker/contenedor.js`,
  `worker/lib/estudio/cuadros.js`). Dibuja con el MISMO motor (la imagen copia `src/lib` desde la raíz, así no se queda
  atrás de la vista previa) y lo que no se puede leer desde dentro —imágenes de la galería, logo, letra del kit— va en el
  pedido, leído de R2 y sólo de ESE cliente. Herramientas `ver_cuadro` (una escena ya «llena» o un segundo), `ver_escenas`
  (una hoja con todas) y `revisar_video` (`revisarEscenas`, con las fuentes reales); devuelven `{ texto, imagenes }` y el
  MCP y el asistente las pasan como bloques de imagen. Rutas GET `/api/videos/<c>/<id>/cuadro|hoja|revision`. La misma
  revisión sale GRATIS debajo de la vista previa (navegador). Cosas que no se ven:
  · **Sin `@cloudflare/containers`**: importa `cloudflare:workers` y las pruebas cargan el Worker en Node. Se usa la API
  nativa (`ctx.container.start`, `getTcpPort`, `setInactivityTimeout`); el cuerpo se pasa como bytes (como flujo pide
  `duplex` fuera de Workers).
  · **En local no hay Container** (`dev.enable_containers: false`): `wrangler dev` y `test:vivo` no necesitan Docker, y
  la ruta contesta 503 diciéndolo. La imagen se prueba de verdad en CI (job «contenedor») y en «Desplegar» ANTES de
  publicar: se construye, se arranca y `container/probar.mjs` le pide un cuadro, la hoja y la revisión.
  · **La imagen no usa Docker Hub**: la base sale del espejo oficial en ECR (Docker Hub limita las descargas anónimas),
  la letra de respaldo (Roboto, la que nombra `FUENTE_RESPALDO`) llega por npm y se registra al arrancar, y ffmpeg sale
  de los repositorios de DEBIAN (`apt`, sin los recomendados): un binario suelto de npm o de GitHub sería de un tercero.
  · **`basic` (¼ vCPU, 1 GiB) y se duerme a los 2 min**: la memoria se paga despierta, la CPU sólo al dibujar; una
  sesión de cuadros son ~120 GiB-s, unas 750 al mes dentro de lo que trae Workers Paid.
  · **`wrangler deploy` publica el Worker ANTES de subir la imagen**: sin el permiso `Containers: Edit` en el token, el
  Worker queda publicado y sólo el cuadro falla (503). Migraciones de Durable Objects `v2` (`ContenedorVideo`) y `v3`
  (`RenderVideo`), no de D1.
  · **El RENDER a mp4 es OTRO Container, con la misma imagen** (`RenderVideo` en worker/contenedor.js, binding `RENDER`,
  a medida: 2 vCPU, 6 GiB —el mínimo de memoria para 2 vCPU—, 6 GB; se duerme a los 30 s). Uno por video
  (`idFromName(<id>)`). `POST /api/videos/<c>/<id>/render` (y `renderizar_video` para Claude y el asistente) sólo con
  el guion aprobado y SU locución (`puedeRenderizar`, src/lib/renderVideo.js); deja el video «Renderizando» con un
  `intento` y el objeto contesta ya: lo hace en su ALARMA (hasta 15 min, sigue aunque se cierre la pantalla), con
  `ejecutarRender` (worker/lib/estudio/render.js). Cosas que no se ven:
  · **En el Container** (container/render.mjs): primero el AUDIO —la toma DECODIFICADA sola a PCM estéreo de 48 kHz
  (una cadena simple), cortada en el segundo del AUDIO de cada silencio de las escenas, con silencio metido y rellenada
  hasta el último cuadro COPIANDO MUESTRAS en JS (`tramosDeAudio`, `armarPcm`); loudnorm sólo MIDE (`FILTRO_MEDIR`), la
  segunda pasada es una GANANCIA fija con un limitador a -2 dB si el pico se pasaría (`gananciaDe`, `filtroDeNormalizar`)
  y una tercera mide lo que quedó; y a AAC—. **Nunca la segunda pasada de loudnorm (`measured_*`):** cuando no puede ir
  en lineal pasa a su modo dinámico, y el ffmpeg 5.1 de la imagen muere ahí con «Error reinitializing filters! | Failed
  to inject frame into filter network: Invalid argument». Una voz de verdad (picos altos) casi nunca va en lineal; el tono
  de la prueba de humo y Feria, sí: por eso pasaban. El ffmpeg 6.1 de Ubuntu no falla: en local todo pasaba.
  `container/probarAudio.mjs` lo prueba DENTRO de la imagen (CI y «Desplegar»): MP3 mono a 44,1 kHz con y sin pausas,
  una después del final del archivo, una voz con picos (limitador) y una toma que cambia de muestreo; mira el volumen,
  el pico y que el silencio caiga en su sitio; luego cada cuadro con el MISMO
  `dibujarFrame` y sus píxeles EN CRUDO por una tubería a ffmpeg (H.264 crf 20, BT.709 dicho en el archivo,
  `+faststart`). Mandar cada cuadro como JPEG costaba un 40 % más de CPU: codificar un JPEG de 1080 × 1920 con grano
  (30 ms) es más caro que dibujar el cuadro (1,3 ms). Medido aquí con la toma de Feria del Lente (31,8 s): 20 s de
  reloj, el silencio de 0,8 s exacto en 3,04 s y -14,0 LUFS medido aparte con ebur128.
  · **El costo**: un video de ~30 s despierta el Container ~1 min y usa ~50 vCPU-s: unos 360 GiB-s de memoria. Lo
  incluido en Workers Paid (25 GiB-h, 375 vCPU-min) da para ~200 renders al mes; pasado eso, ~0,3 céntimos de dólar por
  video (precios de la documentación de Cloudflare, octubre de 2026). No gasta IA: no pide confirmación de costo.
  · **El encargo se BORRA antes de empezar**: si el objeto muere a la mitad, la alarma no repite el render; el video se
  queda «Renderizando» y al leerlo pasado `PLAZO_RENDER_MS` (15 min) pasa a «Falló el render» (`renderAlDia`). Un
  encargo con otro `intento` no toca nada: el proyecto ya espera otro.
  · **El mp4 va a R2, a la galería** (`estudio_archivos`, tipo «video», modelo `video-animado` «Animado con código»,
  costo 0) **y a su PUBLICACIÓN** si el video va ligado a una: primero en sus medios, o en el sitio del render anterior
  de ESTE video (`videoAnimado` en el medio), con `mediosCambiadosAt` y `usado_en`. El calendario se escribe con su
  `updated_at` como condición (si otra persona guardaba a la vez, se relee una vez; si no, queda en la galería y se
  dice) y luego `resincronizarCalendario` + `calendario:recargar`, como el MCP. Una publicación ya PUBLICADA no se toca.
  · **La voz se manda dentro del pedido** (base64, ≤ 20 MB): el Container no tiene llaves ni internet.
  · **A qué publicación va se escoge cuando se quiera** (`ligarAPublicacion` en render.js; `POST
  /api/videos/<c>/<id>/publicacion`, `ligar_video` y `publicacion_id` en `renderizar_video`; «Va en la publicación» del
  panel del mp4, con `publicacionesParaVideo`: desde una semana atrás, primero reels e historias). Antes sólo se ligaba al
  CREAR el video y sólo Claude podía. Con el mp4 ya hecho se pone en el post al momento, sin otro render (y apunta su
  `usado_en`); sin mp4, al terminar. Desligar NO saca el mp4 del post de antes. No se cambia mientras renderiza (409).
  · **Lo probado**: el render de verdad en este equipo con el ffmpeg del sistema (Ubuntu 6.1) y en CI con la imagen
  (ffmpeg de Debian 5.1, `probar.mjs` pide un render con una voz sintética y exige el mp4, sus dos pistas, los cuadros y
  -14 LUFS ±1). El Durable Object y la alarma, con dobles: el primer render en Cloudflare es la prueba de verdad.
  · **El render acepta VIDEO: la capa `video`** (un clip de la galería del cliente: lo que grabó, uno de Kie, uno de
  Drive). `encuadre` «completo» lo pone a sangre detrás de todo (fuera del reparto, con `oscurecer`, un velo para leer
  el texto; en el gancho NO se retrasa: es el fondo del primer cuadro) y «caja», en su zona como una imagen (con la
  forma del clip, de `recursos.videoInfo`). Empieza en su `desde` al entrar la capa y va a velocidad normal
  (`segundoDelClip`); con `hasta`, la escena dura al menos ese tramo (`duracionMinimaDeEscena`: lo que falte se inserta
  como silencio, igual que una `pausa`), así una escena SIN habla dura lo que su clip. Un guion sin habla en ninguna
  escena (`tieneHabla`) no necesita locución (`puedeRenderizar` → `sinVoz`): un montaje de lo que grabó el cliente sale
  sin pagar voz, con el sonido de sus clips (`sonido`, `volumen`; la música baja también cuando habla un clip). Receta
  «Montar el video que grabó el cliente». Cosas que no se ven:
  · **El clip NO va en el pedido JSON**: pesa decenas de MB y el Worker (y el Durable Object) tiene 128. Se SUBE antes al
  Container por flujo desde R2 (`subirClips` en cuadros.js: `HEAD /clip/<id>` y, si no está, `PUT` con el cuerpo de R2 y
  `duplex: "half"`), y el pedido sólo lo nombra (`videos`). El Container lo guarda en disco con su medida de ffprobe
  (container/clips.mjs; hasta 2 GB, borra lo menos usado) y lo reutiliza mientras está despierto. `ContenedorVideo`
  pasa el PUT tal cual (flujo); lo demás, como bytes. Un clip que no sube sale con el «Video» de espera y se dice.
  · **Las IMÁGENES van en el pedido sólo hasta 16 MB** (`TOPE_TOTAL` en cuadros.js, con el logo y la letra PRIMERO): lo
  que no cabe (o pesa más de 8 MB) se sube igual que un clip, `PUT /imagen/<id>` (`subirImagenes`, container/imagenes.mjs,
  en disco mientras el Container está despierto), y el pedido lo nombra en `imagenesSubidas`. Con 13 fondos de IA de ~2 MB
  (57DMC) el último se caía del tope de entonces (24 MB) y salía como marcador; y el JSON entero vive varias veces en la
  memoria del Durable Object del render. Una que no sube sale como marcador y el render lo dice.
  · **El mp4 vuelve del Container a R2 POR FLUJO** (`guardarMp4` en render.js, con `FixedLengthStream` y el largo de
  `X-Bytes`): leerlo entero mataba el Durable Object («Memory limit exceeded before EOF») con un video de 100 s con fondos y
  grano. Y lleva tope de bitrate (`RENDER.kbpsVideoMax`, 12 Mbps): con `crf` solo pasaba de 100 MB, e Instagram admite 25 Mbps.
  · **El motor no espera nada**: pide el cuadro con `recursos.video({ id: escena/capa, archivo }, segundo)`. Quien dibuja
  lo pone ANTES: el render con un `Decodificador` por USO (ffmpeg saca los cuadros RGBA seguidos a 30 fps y se leen a
  medida que se piden, nunca el clip entero en memoria; se cierra cuando el uso deja de verse), /cuadro y /hoja con un
  ffmpeg por cuadro (`cuadrosParaUnInstante`). Qué pide cada instante lo dice `videosEnInstante` (la MISMA cuenta que el
  motor, también la escena anterior durante la transición, quieta en su último cuadro).
  · **Se decodifica a su medida, no a la del lienzo** (`medidaDeDecodificar`: sin pasar de 1920 de lado ni agrandar), y
  un clip grabado de lado se mide GIRADO (`leerSonda`: la rotación de ffprobe; ffmpeg lo endereza al decodificar).
  · **En la vista previa es un `<video>`** (`proveedorDeVideos` en motorVideoNavegador.js): mientras se reproduce corre
  solo y sólo se corrige un desfase de más de 0,35 s; al mover la barra se busca el cuadro y `alCambiar` repinta al
  llegar. Suena si su capa lleva `sonido` (si el navegador no deja sin un toque, sigue mudo). Su `width`/`height` se
  igualan a lo que mide el clip: en un `<video>` son los atributos (0) y el motor mide con ellos.
  · Medido aquí: un clip a sangre cuesta ~50 ms por cuadro (escalar a 1080 × 1920 en Skia), ~1,5 s de render por
  segundo de video. `container/probarClips.mjs` lo prueba DENTRO de la imagen (CI y «Desplegar»): sube un clip y uno
  girado, mira los colores del cuadro y renderiza un montaje sin voz con el sonido del clip en -14 LUFS. Los
  subtítulos de lo que dice la persona del clip NO salen solos (necesitarían transcribir el clip con tiempos): queda
  pendiente.
  · **Los subtítulos los dibuja el MOTOR** (`dibujarSubtitulos` en motorVideo.js; los grupos y la clave, en
  `src/lib/subtitulos.js`), así salen iguales en la vista previa, en `ver_cuadro` y en el render. Van con los tiempos de
  la línea de tiempo, que ya son del VIDEO (con los silencios insertados): en un silencio no se ve ninguno (el último se
  apaga a los `COLA_GRUPO` segundos). Un grupo nunca cruza una coma ni un punto: «de Panamá y La | Chorrera» salía
  cortando por letras. Borde oscuro y el claro de la paleta, para leerse sobre cualquier fondo.
  · **La voz suena en la vista previa** (VideoAnimado, `tramoDeAudio` en videoEscenas.js): mientras se habla manda el
  reloj del AUDIO (si se atasca cargando, la animación lo espera); en un silencio insertado el audio se calla y manda el
  del navegador. Así suena como sonará el mp4. Sólo con la locución de ESTE guion (si sus tiempos no cuadran, la línea
  es estimada y no suena). El audio arranca dentro del toque de «Reproducir»: Safari en el iPhone no deja sonar lo que
  no empieza con un gesto. Probado en Chromium con un audio de la duración real; en un iPhone, no.
  · **La voz puede comerse el final** (`palabrasMudas`): ElevenLabs v3 cortó «tu cita por WhatsApp» en Feria del Lente y
  la alineación dejó esas palabras sin duración, pegadas al último instante. La vista previa y `ver_video` lo dicen con
  las palabras: no se pueden subtitular ni se arreglan solas (otra toma, o acortar el cierre).
  · **Sólo se aprueba un BORRADOR** (`aprobarProyecto`, y el botón): «aprobar» otra vez un video con locución lo
  devolvía a «Guion aprobado» y parecía sin voz. Uno que quedó así con la voz de su versión no la pide otra vez
  (`siguientePaso`).
  · **Las piezas del paso 3** (`src/lib/motorPiezas.js`, puro: lo comparten la vista previa y el Container): la CIFRA
  gigante (cuenta hasta su valor en `DURACION_CUENTA`, con el ancho del valor final para no bailar; coma decimal y punto
  de miles), el ANILLO (un porcentaje que se llena), 22 ICONOS dibujados con primitivas (un test exige uno por cada
  nombre de `ICONOS_VIDEO`; con `fondo`, en un círculo) y el DIBUJO, el lienzo libre: hasta 24 formas en fracciones de su
  caja, cada una con su `retraso` y su `entrada` (`dibuja` traza las líneas; lo relleno se descubre con un recorte puesto
  ANTES de trazarlo, o rellenaría el recorte). Fondos `estrellas` (titilan con t) y `lineas`, sembrados. Sin `Path2D`:
  no existe en el Container.
  · **El PERSONAJE se dibuja de verdad** (`src/lib/personajeVideo.js`, decisión de la agencia: el bebé de Baby Caleb en
  todos sus videos): una figura plana de la casa —bebé, niño o adulto— con 5 expresiones (`expresion`: neutral, feliz,
  triste, preocupado, dormido; «auto» la saca de la pose) y 6 poses, animada con `vida` (parpadeo, la lágrima, las «Z»,
  el saludo). El ASPECTO (piel, pelo, ropa —un token de la marca o #RRGGBB—, accesorio: chupete, lazo, gorro) es del
  CLIENTE: `kit.personajeVideo`, que fija `personaje_video` (asistente y MCP) y que `conPersonajeDelKit` pone en el guion
  en la vista previa y en el servidor (`pedidoDelVideo`) si el guion no trae su `estilo.personaje`. `fundirKit` lo
  conserva. Sólo arc, bezier y líneas: ni Path2D ni ellipse (el lienzo del Container no los garantiza). El kit de
  Baby Caleb aún no lo tiene: sale con el aspecto de partida hasta que alguien lo fije.
  · **El logo se recorta de su fondo liso** (`quitarFondoLiso`): si las cuatro esquinas son opacas y del mismo color,
  ese color se borra DESDE EL BORDE (el blanco dentro de una «O» se queda), sólo si es entre el 5 y el 97 % de la
  imagen. Y lleva PLACA (clara sobre oscuro, oscura sobre claro) cuando más del 20 % de lo que se ve de él no llega a 2 a
  1 con el fondo de la escena (`logoNecesitaPlaca` sobre los cuantiles de su luz, `tonoDeImagen`): con la media, un logo
  rojo con letras azul marino «contrastaba» con un fondo azul y las letras desaparecían. Lo prepara quien carga
  (`prepararLogo` en el navegador, `cargarLogo` en el Container): el motor sólo lee `recursos.logoTono`.
  · **El reparto llena el cuadro** (el video de Feria salía con el texto pequeño y media pantalla vacía): los textos
  piden un ancho mínimo de su columna (`ANCHO_TEXTO`) y, si la escena ocupa menos del `LLENADO` (68 %) de su alto,
  todo crece hasta `CRECER_MAX` (×1,35) sin pasar del ancho. Los tamaños por rol subieron (titular 0,105 del lado).
  · **1:1 y 16:9 crecen más que 9:16** (`CRECER_POR_FORMATO`: 1,35 · 1,55 · 1,8): con el mismo lado corto hay sitio
  alrededor, y el contenido se quedaba pequeño en medio. En 16:9 van en DOS columnas no sólo la imagen o el personaje,
  también el icono, el anillo, el dibujo, la lista, el reloj y el logo (`IZQUIERDA_APAISADO`; el texto, a la derecha y
  un poco más ancha), lo visual llega al 82 % del alto (`altoUtil`) y una columna sola no pasa del 68 % del ancho
  (`ANCHO_COLUMNA_APAISADO`): a todo el ancho, un titular salía en una línea larguísima y pequeña.
  · **La revisión también mira el DISEÑO** en el instante «lleno» de cada escena (que espera a que una cifra o un anillo
  terminen de contar): `texto_pequeno` (menos del 3,5 % del lado, ~38 px), `espacio_vacio` (lo que se ve ocupa menos
  del 12 % del cuadro, o cabe en una franja de menos del 35 % del alto) y `desequilibrio` (el centro de lo que OCUPA la
  escena —no pesado por área: un titular ancho abajo y una cifra arriba no están «abajo»— se va más del 15 % del alto o
  del 12 % del ancho). Son avisos, no graves. Un texto `porPalabra` está «lleno» cuando se dice su ÚLTIMA palabra
  (`instanteLleno`): con un titular cantado, la hoja enseñaba la escena con una palabra o vacía.
  · **La zona estricta mira lo que SE VE** (`cajaVisible` en revisionEscenas.js): el motor mide un texto con el ancho de
  su COLUMNA, no el de sus letras, y comparar eso con el 91 % avisaba de todos los titulares (37 avisos en el video de
  57DMC). Y el área segura de 9:16 tiene ahora el 9 % libre a cada lado (`ZONA_SEGURA`, antes 6 %): el gigante y el
  texto que crece llegaban al 94 %, debajo de los botones de la red.
  · **El SONIDO va aparte del guion** (`videos_proyectos.sonido`, 0060; `src/lib/sonidoVideo.js`, `efectosSonido.js`,
  `VideoSonido.jsx`; `PUT /api/videos/<c>/<id>/sonido`, herramientas `sonido_video` y `musicas`): cambiarlo NO sube la
  versión ni devuelve a borrador, así que no obliga a pagar otra voz; se oye al volver a renderizar (gratis). Los EFECTOS
  (encendidos por defecto) son un whoosh en cada transición que no es un corte y un pop al entrar un sello o un llamado,
  SINTETIZADOS (ruido filtrado con semilla, un tono que cae: sin archivos ni licencias) y mezclados 12 dB por debajo del
  nivel de la voz. La MÚSICA es un audio de la galería del cliente (`subirArchivo(…, { musica: true })`, tipo «audio»,
  modelo `musica-subida`; las locuciones también son audio y no salen en `musicasDe`): se mezcla en JS por debajo de la
  voz con DUCKING (9 dB bajo la voz en los huecos, 20 mientras se habla; baja en 80 ms y sube en 450), fundido de 0,4 s al
  entrar y 2 s al salir, repetida si es corta, ±12 dB a mano. Todo antes de la ganancia, así guarda su distancia con la voz
  sea cual sea la toma. Una música que ya no está no tumba el render: sale sin ella y lo dice en `render.aviso`.
  · **La música con SUNO por Kie** (`src/lib/musica.js`, `worker/lib/estudio/musica.js`, `docs/kie/suno.md`;
  `POST /api/videos/<c>/musicas/generar`, herramienta `generar_musica`, «Generar la música con IA (Suno)» en «Sonido»):
  un trabajo del Estudio de `tipo: "audio"` por la MISMA cola de Kie que la voz (`MODELOS_MUSICA_KIE` en kie.js,
  `terminarMusica` en trabajos.js). Siempre MODO PERSONALIZADO (es el único que admite `duration` y `title`): la
  descripción va en `style`, la letra en `lyrics` y NUNCA en `prompt` (se cantaría tal cual); una instrumental lleva las
  voces en `negative_tags`. Suno da DOS versiones: las dos van a la galería (`modelo: "musica-suno"`) y, con `videoId`,
  la primera queda en el SONIDO del video (sin subir la versión; no pisa otra música escogida DESPUÉS del pedido ni a un
  video renderizando). Con video, la duración es la del video y el estilo lo escribe el director musical (abajo).
  **El precio no viene en la documentación**: se cotiza `CREDITOS_SUNO` como aproximado y al entregar se apunta
  `creditsConsumed` si llega. Se confirma SIEMPRE (409 `confirmar`), como la voz. El render usa además la música del
  GUION por su clave si «Sonido» no tiene otra (`dbDeVolumenGuion`). **Nada de Suno se ha probado contra Kie real.**
  · **La música la pide el DIRECTOR MUSICAL, no el `guion.musica.estilo`** (decisión de la agencia: con la voz los videos
  quedaban perfectos y la música no casaba; `src/lib/directorMusical.js`, `worker/lib/estudio/directorMusical.js`;
  `POST /api/videos/<c>/<id>/musica`, «Proponer la música para este video» en «Sonido»). Ese estilo lo escribía la IA
  del guion en una línea («corporativa alegre») sin saber nada del video. Ahora una IA de texto (función «director
  musical», hueco «guiones»; barata, sin confirmación) LEE el guion GUARDADO con su línea de tiempo —la de la locución
  si está lista; si no, estimada y lo dice—, la ficha del cliente, el cerebro para escribir, el kit y el tipo de
  contenido de su publicación, y escribe el pedido para Suno. Cosas que no se ven:
  · **Lo que se puede contar lo cuenta el CÓDIGO** (`analisisDelVideo`): segundos por escena, cortes por minuto, el BPM
  que casa con los cortes (`bpmPorCortes`: un compás de cuatro tiempos por escena llevado por octavas al rango del
  `estilo.ritmo` del guion), los silencios (lo que queda de cada escena tras su última palabra) y dónde entran el
  gancho, el beneficio y el llamado. La IA recibe eso y escoge género y subgénero, instrumentos y cómo sube la energía.
  · **La MÚSICA DE LA MARCA manda** (`kit.musica`: { estilo, evitar, referencias }; `limpiarMusicaDeMarca` en kitMarca.js,
  `fundirKit` la conserva; se edita en Marca → Kit y voz, `MusicaDeMarca.jsx`). «Me gusta: que sea la música de la
  marca» en «Sonido» (`POST /api/videos/<c>/musicas/marca`, sobre el kit GUARDADO) pasa una música GENERADA a sus
  referencias con lo que se le mandó a Suno (`ajustes.pedido.estilo`; `musicasDe` lo devuelve como `estilo`); una subida a
  mano no lo sabe: 409. Como mucho tres, la más nueva primero; la siguiente propuesta las lee.
  · **El estilo va en INGLÉS y siempre con su BPM** (`leerPropuestaMusical`): se le quitan los artistas («in the style
  of…», «like» + nombre propio: Suno los rechaza y sería copiar) y las voces del «evitar» (lo de la marca va primero).
  `cuerpoSuno` pone ahora las voces DELANTE en `negative_tags`: con un «evitar» largo, lo que no puede caerse en una
  instrumental es «sin voces».
  · **Por defecto, siempre**: `generar_musica` y la pantalla, para un video SIN estilo dicho, piden lo del director
  (`pedirMusica`); con estilo dicho manda la persona (ni se le pregunta). Sin video ni estilo, la música de la marca.
  **La cotización y la confirmación piden LO MISMO**: la propuesta se guarda en R2 (`musica-director/<espacio>/<video>.json`,
  fuera de `clientes/`) con la huella de lo que la decide (`huellaMusical`: lo que se dice, la voz, la música de la marca)
  y la confirmación la reusa 6 h sin pagar otra vez al director; si el guion cambió, se piensa de nuevo. La respuesta de
  `generar_musica` (también al cotizar) dice qué pidió y por qué. Sin IA (sin llave, sin presupuesto, caída) sale el
  RESPALDO (`propuestaDeRespaldo`: la música de la marca o la pista del guion con el tempo de los cortes) y el aviso.
  · No toca el video: proponer no guarda nada en `videos_proyectos` (lo que se paga a Suno sigue su camino de siempre).
  **Nada de esto se ha probado contra Anthropic ni Kie reales**: los tests (tests/migracion/musica.director.test.js)
  usan un `fetch` de mentira.
  · **El HISTORIAL** (`videos_versiones`, 0060; `versionesDe`, `volverAVersion` en videosProyectos.js; `GET|POST
  /api/videos/<c>/<id>/versiones`, `versiones_video`, `volver_a_version`): cada cambio del guion guarda el de ANTES (hasta
  `MAX_VERSIONES`, 30). Volver crea una versión NUEVA con ese guion, en borrador; nunca se reescribe la historia.
  · **Si lo que se DICE no cambió, la voz sigue valiendo** (`vozQueSigueValiendo`): al aprobar, si la locución está lista y
  `textoParaVoz(guion)` es exactamente el `prompt` de su trabajo, pasa a la versión nueva (`deVersion` dice de cuál era) y
  el video queda «Con voz». Cambiar capas, fondos o pausas ya no obliga a pagar otra locución.
  · **Un sello que se parte en dos líneas avisa** (`sello_partido` en revisionEscenas.js): un sello se lee de un vistazo
  en UNA línea.
  · **El ejemplo de `formato_video` sólo usa componentes que el motor ya dibuja** (un test lo exige): uno con marcadores
  enseñaba a Claude justo lo que hay que evitar.
  · **El PASO 4: crear un video sin Claude** (`CrearVideoAnimado.jsx`, `EditorEscenas.jsx`, `LocucionVideo.jsx`, lazy los tres:
  el chunk de VideoAnimado está cerca de su tope). «Video nuevo» pide la idea (o la publicación del calendario), la
  duración (15–60 s) y el formato, y `POST /api/videos/<c>/escribir` (`worker/lib/estudio/guionAnimado.js`, lo puro en
  `src/lib/guionAnimadoIA.js`) le pide el guion a la IA de texto con el MISMO `formatoParaLaIA` que lee Claude, el cerebro
  para escribir, el catálogo con los IDs de la galería de sus fotos y el personaje del kit. Se VALIDA; con errores, UNA
  vuelta de corrección y si no, 502. NO guarda: se abre como borrador sin guardar (y ligado a la publicación si salió de
  una). «Editar los textos» cambia lo que se dice y se lee sin tocar el JSON. «La voz» pide la locución con el 409 de
  siempre (ver el costo → «Generar por …»). En el panel de un reel o una historia, «Video animado» abre todo esto
  (`ReelIA` con `forma="animado"`). Función «guion de video»: texto, sin confirmación, como «Dame ideas».
  · **Todo componente del formato se dibuja** (`motorComponentes.js`): lista con sus ítems ESCALONADOS (`cada`), burbuja,
  reloj (esfera, contador, cuenta atrás), antes y después (lado, deslizador, secuencia) y teléfono (chat con los mensajes
  uno tras otro, imagen, color, notificación). El «instante lleno» de la revisión y de la hoja espera a que entren todos
  (`tardaEnLlenarse`). Una capa anclada a una palabra entra `ANTICIPO` (0,12 s) antes. La cifra puede ir `abreviada`
  («412K», «3,2M»). En 9:16 la revisión avisa del texto esencial fuera de la zona estricta (`ZONA_ESTRICTA_916`: del 13,5
  al 76 % del alto y del 5,5 al 91 % del ancho).
  · **Nada de esto se ha probado contra Kie real** (los tests hablan con un `fetch` de mentira): los nombres de los campos
  de v3 y v2, si la voz va por id o por nombre (`vozParaKie`), si devuelven tiempos y en qué forma, y el redondeo real de
  los créditos salen de la documentación pública y se comprueban con la primera toma de verdad.
- **El video se hace en el SERVIDOR y sale TERMINADO: el reel por planos es un ENCARGO** (decisión de la agencia: dejar Flow
  y CapCut; `worker/lib/estudio/encargoReel.js`, `montaje.js`, `src/lib/montajeReel.js`, `duracionesVideo.js`, 0063).
  Antes FlujoReel orquestaba con `await` y cerrar la pestaña paraba el storyboard o el video a medias. Cosas que no se ven:
  · **Tipo «reel» en `estudio_encargos`** (sin migración: `tipo` no tiene CHECK). Los pasos son los FOTOGRAMAS (uno por
  plano, `paralelo` 1, en orden: cada uno con el FINAL del anterior y del primero de referencia, `pedidoDeFotogramaReel`,
  el mismo pedido que a mano) y reusan lo de siempre del encargo: el trabajo, la proporción (`revisar`) y `finales`. Lo que
  la pantalla corrige o rehace a mano se dice con `POST …/final` y MANDA: el video y los clips salen de ahí.
  · **Después, `pasoReel`**: «uno» (un video con el storyboard, `pedidoDeVideo`) o «clips» (un clip limpio por plano, de
  uno en uno por paso pero todos a la vez en la cola; `p.clip`). Con `revisar` se para tras el storyboard (`video.fase`
  «espera», el encargo queda «hecho») y `POST …/continuar` lo vuelve a poner en marcha; un 409 si el storyboard va a medias.
  · **El MONTAJE** (`POST …/montar`, «Montarlo aquí»; o pedido al lanzar): un proyecto de video animado con una escena
  por plano —el clip a sangre (`video`, «completo», con velo), lo que se dice en ese plano (`dice`, o la locución
  repartida por planos cortando en un signo), el GANCHO escrito en la primera, lo que se lee en las del medio, y el LOGO y
  el LLAMADO en el cierre (con `pausa` 1)—, los subtítulos y la música del guion. El texto lo escribe el código: sin
  faltas. Con un solo video, cada escena es SU tramo del mismo archivo. En automático: aprobar, la VOZ —que SIEMPRE se
  confirma: sin `confirmadoVoz` el montaje se queda en «confirmar» con su costo (el 409 `confirmar` de `pedirLocucion`)
  y «Sí, generar la voz» lo sigue— y el render; sin Container (en local) se queda en «espera» y se dice.
  · **Con montaje, el video del modelo va SIN voz** (`pedidoDeVideo({ sinVoz })`): la voz la pone ElevenLabs, y el
  sonido del clip (música, ambiente) se oye debajo, bajito. Los clips van sin sonido (`sonido: "no"`).
  · **Todo resultado se pone SOLO en su publicación** (`ponerEnPost.js`: el calendario con su `updated_at` como
  condición, dos vueltas, `resincronizarCalendario` y `calendario:recargar`): el video (con `deReel`, para volver a su
  sitio), y si están VACÍOS el caption, el guion por tramos («[0–3 s] SE VE: … | VOZ: «…» | TEXTO: …») y la portada
  (el primer fotograma). Con montaje, el mp4 lo pone el render en el sitio del video crudo (`videos_proyectos.origen`).
  El panel de la publicación abierto recibe lo mismo (`onPoner` con `quedarse`): si no, su guardado al cerrar lo pisaría.
  Las piezas que pide Claude con `post_id` (`disenar_piezas`) también se ponen solas al terminar (`datos.poner`,
  `ponerResultados`; un carrusel entero en su orden); el lote de la pantalla NO (escoge entre versiones).
  · **Las duraciones salen de las llaves** (`duracionesDeReel`): «uno» sólo con un modelo que hace ESA duración exacta
  (el servidor lo comprueba: 400), y lo que pasa de ahí, por clips y montaje. Ya no hay «sólo para Flow»: el prompt para
  Flow sigue en un desplegable. El ZIP de clips para CapCut se QUEDA («Descargar los clips para CapCut»).
  · **Un solo generador de guion de video en lo común** (`contextoDeGuion` + `src/lib/guionVideo.js`): el reel, el corto,
  el del producto y el animado juntan igual el producto con su precio, el cerebro, el criterio comercial y la
  publicación. El reel SIGUE el guion que ya tiene la publicación (`guionPost`) en vez de inventar otro.
  · **Una sola voz de la marca** en el kit: la de ElevenLabs (`kit.locucion`, «Probar una voz» la fija). `kit.voz` (Google,
  Omni) queda plegada, sólo para un video de Omni con su propia voz sin montaje.
  · **«¿Está listo?» sobre el mp4 montado** (`acabadoDelGuion`, `conAcabado`): lo que lleva encima lo puso el código, así
  que no cuenta como texto mal escrito y da por cumplidos «sin sonido» (subtítulos), «marca» (logo) y «cierre» (llamado).
  · **Por MCP** (`herramientasReel.js`, sólo MCP: herramientas.js no puede llegar a encargos.js ni a mercado.js sin el
  ciclo que deja `DEFINICIONES_ESTUDIO` sin iniciar): `crear_reel` (sin `confirmado`, el guion y el plan con su costo;
  NO SE CREÓ NADA), `estado_reel` (con el storyboard en la vista previa del chat), `continuar_reel`, `montar_reel`
  (`confirmado_voz`), `video_listo` y `extraer_guion_ugc`. El lote del Estudio también hace sus reels por el encargo.
  · **Nada de esto se ha probado contra Kie, ElevenLabs ni el Container reales**: los tests usan los motores de prueba.
- **La BIBLIOTECA DE SONIDO: la música y los efectos de cada cliente y de la AGENCIA, para no pagar a Suno dos veces**
  (decisión de la agencia: «quiero ahorrar créditos… reutilizar música ya generada y subir la mía»; `src/lib/bibliotecaSonido.js`,
  `worker/lib/estudio/sonidos.js`, `worker/rutas/sonidos.js`, `BibliotecaSonido.jsx`; 0075). Cosas que no se ven en la pantalla:
  · **Lo de un cliente sigue en `estudio_archivos`, SIN migrar nada**: la categoría sale del `modelo` (`categoriaDeModelo`:
  musica-suno, musica-subida y musica-agencia son música; efecto-subido y efecto-agencia, efectos), el nombre es el `prompt`, la
  favorita el `favorito` y las etiquetas, el BPM y la duración van en `ajustes.biblioteca`. Las 8 músicas de Suno de Feria del
  Lente y las 4 de Juancito Ads salen solas (con el BPM leído de su estilo). La LOCUCIÓN también es audio y no es de la
  biblioteca (su modelo no empieza por «musica» ni por «efecto»). `vistasDelCliente` (herramientasDiseno.js) ahora pide sólo
  imágenes favoritas: con el tope de 8, una favorita de audio le quitaba sitio a las de diseño.
  · **Lo de la agencia va en `biblioteca_sonidos` y su archivo en R2 bajo `biblioteca/<espacio>/`**, que /api/media NO sirve (sólo
  `clientes/`): lo sirve GET /api/sonidos/agencia/<id>/audio con la sesión del espacio y por TROZOS (`rangoServido`; sin 206 el iPhone
  no lo reproduce). La cambian admin y editores sin clientes (`puedeCambiarAgencia`, 403 a un colaborador, como las estructuras de
  guion); la ven y la usan todos.
  · **`musicasDe` (y GET /api/videos/<c>/musicas) devuelve también lo de la agencia, marcado `de: "agencia"`**, con la forma de
  siempre (id, nombre, src, bytes, modelo, fecha, estilo) y campos AÑADIDOS (categoria, de, origen, favorita, etiquetas, bpm,
  duracion); la ruta suma `efectos`. Orden: la favorita del cliente, lo del cliente, la favorita de la agencia, lo de la agencia
  (`ordenarPistas`). galeria.js la reexporta desde sonidos.js. Quien la use (otro agente hizo «Publicar con música») sólo debe
  AÑADIR campos, nunca cambiarla.
  · **La favorita de la MÚSICA es UNA por biblioteca (la música de la marca)**: marcar otra desmarca la de antes. Un video NUEVO
  nace con ella en su sonido (`sonidoInicial` en videosProyectos.js), salvo que el guion traiga su música por su clave o el sonido
  de sus clips (un montaje que suena solo). Un video de antes no cambia. La favorita de los efectos sólo los pone primero.
  · **El sonido del video puede llevar lo de la AGENCIA**: `limpiarSonido` acepta claves `biblioteca/…` (con `de: "agencia"`) y
  `guardarSonido` busca la pista en las dos (`sonidoParaVideo`; una música del cliente sigue aceptando cualquier audio suyo, como
  antes). El render la lee de R2 sólo si es de ESE cliente o de ESTE espacio (`claveDeSonido`).
  · **Los EFECTOS de la biblioteca** van en `sonido.efectosPropios` ({ transicion, sello }; SÓLO si hay alguno: así el sonido de
  antes sigue siendo `{ efectos, musica }` igual que siempre): con los efectos encendidos, el render manda sus bytes en base64
  (`efectosPropios: { whoosh, pop }`, ≤ 2 MB cada uno) y el Container los DECODIFICA a PCM como la voz y suenan en los mismos
  instantes que los sintetizados (`muestrasDeEfecto`: mono, sin el silencio de delante ni de detrás, hasta 4 s, pico en 1) y al
  MISMO nivel (12 dB bajo la voz, por el RMS de lo que SUENA: con el del archivo entero, un efecto con silencio detrás saldría
  más fuerte). Un whoosh largo se centra en el cambio sin arrancar más de 0,5 s antes. Uno que ya no está o no se puede leer no
  tumba nada: suena el sintetizado (y el render lo dice en su aviso). Un PUT del sonido SIN `efectosPropios` (una pantalla de
  antes) conserva los que había. `container/probarAudio.mjs` lo prueba dentro de la imagen con un MP3 y un WAV subidos.
  · **Quitar una pista que usa un video lo dice**: 409 `en_uso` con cuáles (`videosQueUsan` mira el sonido de los videos del
  cliente, o de todo el espacio si es de la agencia) y sólo con `?forzar=1` se quita. La del cliente va a la PAPELERA de su
  galería (su archivo sigue 30 días: un render no se rompe; «Deshacer» la recupera); la de la agencia se borra.
  · **Copiar entre las dos no repite**: «Usar de la agencia» copia el archivo al cliente (modelo `*-agencia`, con su estilo de
  Suno en `ajustes.pedido.estilo`: así «Me gusta» la sabe repetir) y «Pasar a la agencia» al revés (para reutilizar una de Suno
  con todos los clientes); las dos por la huella SHA-256 de los bytes. Lo subido también se compara por huella.
  · **M4A se reconoce por su marca** (`tipoPorBytes`: «ftyp» con «M4A »/«M4B » es `audio/mp4`; cualquier otro, video como
  siempre). Topes: 15 MB la música, 2 MB un efecto.
  · **La duración la mide el navegador DESPUÉS de subir, de su dirección** (`conDuracion` en sonidosApi.js, y PATCH con `duracion`):
  medir el archivo antes, con un `blob:`, lo bloquea la CSP (`media-src` cae en `default-src 'self'`). Lo cazó Chromium.
  · **El director musical mira la biblioteca antes de pagar** (`lasQueEncajan` → `pistasQueEncajan`): POST …/<id>/musica y la
  cotización de Suno (el 409) traen `biblioteca`, las pistas que encajan con lo propuesto por sus etiquetas (en español, con sus
  sinónimos en inglés: el director escribe para Suno en inglés), su estilo de Suno y su BPM (también al doble o a la mitad); con el
  BPM solo no basta. «Sonido» las ofrece con «Usar esta (gratis)» y `generar_musica` dice «ANTES DE PAGAR…» para que el asistente
  las ofrezca primero. Es código, no IA: no cuesta nada. `musicas` (Claude y el asistente) lista las dos bibliotecas y
  `sonido_video` acepta `efecto_transicion_id` y `efecto_sello_id`.
  · **El tiempo real**: cada cambio avisa `sonidos` (App.jsx lo pasa como evento de `window`); la biblioteca y «Sonido» releen.
  · Lo probado: las rutas con una D1 de verdad (tests/migracion/sonidos.test.js), el audio con efectos subidos con el ffmpeg del
  sistema y la pantalla en Chromium (subir, etiquetas, la estrella, «Pasar a la agencia», «Usar de la agencia», el teléfono). Ni
  el render en Cloudflare con efectos de la agencia ni el reproductor en un iPhone.
- **«Publicar con música»: un post de UNA foto sale como REEL con música; un carrusel, a mano en un minuto** (decisión de
  la agencia, para probar: la API de Instagram no deja poner su música en fotos ni carruseles —ni en reels: sólo el audio que
  ya trae el video—; `src/lib/conMusica.js`, `worker/lib/estudio/conMusica.js`, `calendario/ConMusica.jsx`, 0076). Cosas que
  no se ven en la pantalla:
  · **La foto es un VIDEO ANIMADO de una escena**: una capa `imagen` con `encuadre: "completo"` (a sangre, detrás de todo y
  fuera del reparto, como un video; `esCapaCompleta` en motorVideo.js), `movimiento` (acercar, alejar, paneo: un «Ken
  Burns» suave de seno en todo lo que se ve; `movimientoDeImagen`) y `dura` (la escena dura eso sin decir nada: sin habla no
  hay locución, `tieneHabla` → `sinVoz`). Los cuatro campos nuevos de la imagen (con `oscurecer`) son OPCIONALES y NO se
  escriben si van como por defecto (`omitir` en su definición): un guion de antes valida EXACTAMENTE igual —si no, volver a
  guardar un video viejo subiría su versión y lo devolvería a borrador—. Con `recorte` «contener» (lo de partida si la foto
  no es casi vertical: un post 4:5 no pierde su texto en 9:16) se ve entera sobre ella misma ampliada, difuminada
  (`ctx.filter = blur()`: @napi-rs/canvas lo hace —probado con el Container en local—; Safari no, y sale nítida y oscurecida)
  y oscurecida. Una imagen a sangre que «aparece» con su escena se ve desde el PRIMER cuadro (`estadoACompleta`): con la rampa
  de 0,12 s el primer cuadro salía negro, y es el que enseñan TikTok y la vista previa.
  · **`POST /api/videos/<c>/con-musica` crea, APRUEBA y RENDERIZA** (`publicarConMusica`): la foto pasa a la galería si no
  estaba (una ficha que APUNTA al mismo objeto de R2, `origen` «app»: la papelera nunca borra el objeto, que es de la
  publicación), la música va en el SONIDO del video (aparte del guion, sin efectos) y el proyecto lleva `origen: { tipo:
  "foto", foto }`. Sin Container (en local), 503 `sin_container` ANTES de crear nada; sin música en la galería, 409
  `sin_musica` (no se genera música nueva salvo que se pida en «Sonido»). La música por defecto (`musicaPorDefecto`): la
  favorita de la lista de `musicasDe` (el campo `favorita`/`favorito`, que añade la biblioteca de sonido), si no una de la
  marca (`kit.musica.referencias`), si no la más nueva. Pedirlo otra vez REUSA el mismo video (otra versión); lo mismo que ya
  salió (mismo guion y misma música: se volvió a la foto) se pone ya sin renderizar (`yaHecho`, por `ligarAPublicacion`).
  · **Al terminar, el RENDER convierte la publicación** (`ponerEnPublicacion` en render.js con `postConMusica`): formato
  reel, el mp4 de ÚNICO medio, la foto de PORTADA (la regla de la portada) y lo de antes en `post.conMusica` ({ foto,
  formato, portada, videoId }) para «Volver a la foto» (`volverALaFoto`: el mp4 se queda en la galería). Si la publicación
  ya no lleva esa foto (se cambió mientras se hacía), no se toca y el render lo dice.
  · **Sin voz, la música sola se NORMALIZA** (container/render.mjs: antes, un audio sin voz ni clips se codificaba tal cual y
  la música quedaba en -34 LUFS, porque `mezclarMusica` la pone por debajo de una voz que no hay). Un caso más en
  container/probarAudio.mjs («Sólo música»); probado aquí con el ffmpeg del sistema: -14,0 LUFS, y un render de 7 s en ~10 s.
  · **Lo que se está haciendo va EN la publicación** (`post.conMusicaPendiente`: { videoId, foto }), no en el componente: el
  panel guarda al desmontar, así que si el reel sale mientras el panel está abierto y su formulario no lo tiene, cerrar lo
  pisaría. Lo sigue la pestaña que esté abierta (Pieza, o Publicar en compacto), con el aviso `videos` y una mirada cada 3 s,
  y al salir pone el reel también en el formulario (`postConMusica` lo quita). Si aun así se pisa (cerrar justo en el
  segundo en que sale), la marca se queda y al volver a abrir el panel se pone sola: se cura sola.
  · **Un carrusel no se convierte: va A MANO** («Con música de Instagram»): `asistida`, `conMusicaInstagram`, la nota y la
  canción (`post.cancionInstagram`, con cuándo se escogió: así la siguiente no la repite). La lista es del kit
  (`kit.musica.cancionesInstagram`, `limpiarMusicaDeMarca` la limpia, `fundirKit` la conserva con la música; se edita en Marca
  → Kit y voz) y vive en `src/lib/cancionesInstagram.js`, SIN importaciones, porque la lee el kit (kitMarca.js no puede
  arrastrar lib/publicacion.js). «Guardar la música de la marca» (MusicaDeMarca) guarda ahora encima de lo que ya había en
  `kit.musica`: antes reescribía el objeto y se habría llevado las canciones. /a-mano comparte las imágenes EN ORDEN de una
  vez (y si el navegador no deja compartir archivos, las descarga todas numeradas) y sugiere la canción con «Copiar el
  nombre» (que la guarda en la publicación) y «Otra canción».
  · **El aviso a la hora de lo que se publica a mano** (`worker/lib/avisosAMano.js`, tabla `avisos_a_mano`, 0076): las
  publicaciones viven en el JSON del mes y buscarlas cada minuto sería leer todos los calendarios; por eso cada una a mano
  tiene una fila con su momento (`para`) y lo ya avisado (`previo_at`, `hora_at`), escrita por `sincronizarAvisosAMano`
  desde `resincronizarCalendario` (por donde pasan todas las escrituras de un calendario; sin nada a mano NO consulta nada).
  El cron (`avisosAManoPendiente`) hace UNA consulta sin nada que avisar; si toca, apunta el aviso ANTES de darlo (con lo
  leído como condición: no se repite), lo comprueba contra el calendario (lo que dejó de ser a mano, se publicó o cambió de
  momento no avisa: la fila es un atajo y el calendario la verdad), avisa a quien la lleva o a todo el equipo con el enlace a
  /a-mano, y da como mucho tres por vuelta. Va DETRÁS de las historias automáticas y ANTES del Estudio (no al final del
  todo): un «es la hora» que llega una hora tarde no sirve, y sin nada que hacer cuesta lo mismo que no estar. Lo que lleva
  más de 2 h pasado se apunta sin avisar.
  · **El asistente y Claude**: `publicar_con_musica` (herramientasVideo.js): un post de una foto → el reel (no gasta: lo dice);
  un carrusel → a mano con la canción. No está en `CON_VISTA` (la vista previa del chat): el mp4 se mira con `ver_video`.
  · **Nada de esto se ha probado contra Instagram**: que el reel salga como «audio original» lo dice su documentación.
- **«Video con tu canción»: el video animado sobre una canción YA GRABADA, y la canción ES su locución** (decisión de la
  agencia: sube el MP3 terminado del fragmento del reel y pega la letra; `src/lib/videoCancion.js`,
  `worker/lib/estudio/cancion.js`, `CrearConCancion.jsx`, `CancionVideo.jsx`; sin migración: todo vive en el JSON del
  proyecto). Lo que no se ve en la pantalla:
  · **MODO CANCIÓN en el formato**: `cancion: { archivo, duracion, nombre? }` en la raíz del guion, OPCIONAL y que no se
  escribe si no está (un guion de antes valida igual y volver a guardarlo no le sube la versión). Con ella,
  `lineaDeTiempo` va por `lineaDeCancion`: NUNCA inserta silencios (ni `pausa` —se ignora con aviso—, ni el alargue de
  `MIN_ESCENA`, ni el `hasta` de un clip, ni el `dura` de una imagen), el total es lo que dura la canción (el final
  instrumental se ve) y una escena SIN letra ocupa el hueco entre la última palabra cantada de la anterior y la primera
  de la siguiente (varias seguidas se lo reparten; la primera escena empieza en 0). Una escena de menos de `MIN_ESCENA` va
  en `linea.avisos` y NO se estira (desincronizaría la música). Topes propios: 180 s y 80 escenas (`MAX_SEGUNDOS_CANCION`,
  `MAX_ESCENAS_CANCION`). El render y el Container NO cambiaron: la línea sale sin silencios y `armarPcm` copia la canción
  tal cual hasta el último cuadro (un caso más en `container/probarAudio.mjs`).
  · **La locución con `origen: "cancion"`** guarda la canción (archivo, clave, `src`, mime, duración medida de los bytes
  —`duracionDeAudio`: MP3, WAV, M4A— o la que midió el navegador), la letra, `oidas` (la LETRA con sus tiempos, una por
  palabra), `coincidencia`, `fuente` y `desplazamiento`. Las `palabras` del guion NO se guardan como verdad: se sacan GRATIS
  al leer (`palabrasParaLinea` / `conPalabrasDeCancion`: `alinearPalabras` del guion de ahora contra `oidas` movidas por
  el ajuste fino) en `deFila`, en `pedidoDelVideo` (lo que recibe el Container) y en la vista previa (con el guion SIN
  guardar). La canción sigue valiendo mientras el guion diga la letra (`estadoDeCancion`: la misma canción y duración, ≥
  `COINCIDENCIA_MINIMA`): aprobar la deja «Con locución» sin pagar nada, `puedeRenderizar` lo exige (sin mirar la versión
  de la locución) y `pedirLocucion` contesta 409 `cancion`: generar una voz la pisaría.
  · **Sincronizar** (`POST /api/videos/<c>/cancion`) es UNA llamada dentro de la petición (la canción ≤ 15 MB en memoria) y
  SIEMPRE pide confirmar (409 con lo de una alineación y lo más que puede costar). La canción es de la biblioteca del
  cliente o de la agencia de ESTE espacio (`sonidoParaVideo` + `claveDeSonido`). Orden: Forced Alignment con la mezcla →
  si no sirve, Voice Isolator y Forced Alignment de la voz aislada → si no (o sin llave), Gemini la oye con la letra
  delante → si no, estimado y lo dice. **Una alineación FORZADA devuelve siempre la letra que se le dio**: que las palabras
  casen no dice nada, así que la `coincidencia` de una alineación es exactas × (1 − aplastadas) (`medirAlineacion`: las que
  quedan sin duración son las que no encontró entre la música). La escala del `loss` de ElevenLabs no está verificada: se
  apunta, no decide. Cada llamada que sale bien se apunta en `consumo_ia` (proveedor «elevenlabs», función «sincronizar
  canción»; por sus créditos si la respuesta los dice —`character-cost`—, si no lo aproximado: `USD_ALINEAR_POR_MINUTO`,
  `USD_AISLAR_POR_MINUTO`, NO verificados). El resultado queda en R2 bajo `canciones/<espacio>/<cliente>/<huella>.json`
  (fuera de `clientes/`), con un extracto CRUDO de cada respuesta: la misma canción con la misma letra otra vez sale
  gratis, y crear el video lo lee de ahí por su huella (no lo que mande el navegador).
  · **La prueba de sincronía** (`guionKaraoke`, gratis): una escena por línea (las largas se parten; las que se cantan
  muy seguidas se juntan), la línea de titular con un icono encima y una forma detrás (sin pieza visual la revisión la da
  por vacía), el coro (las líneas que se repiten) con placa y estrellas, escenas sin letra en los huecos de más de 2 s
  (intro y final con el logo, puente con una forma) y el logo al cierre. «Diseñar las escenas con IA»
  (`escribirGuionCancion`, función «guion de video») lleva la letra por líneas con sus tiempos, el coro y los huecos; la
  aplicación le pone SU canción y le quita la música (`conLaCancion`) y `comprobarLetra` exige la letra tal cual: una
  vuelta de corrección y si no, 502.
  · **El render** lee la canción con `claveDeSonido` (también de `biblioteca/<espacio>/`), ignora la música de «Sonido» (y
  lo dice en `render.aviso`) y deja los efectos. La vista previa la toca por `locucion.src` (la de la agencia va por
  `/api/sonidos/agencia/<id>/audio`). En el chat de Claude, `video_con_cancion` está en `CON_VISTA` y la canción de la
  agencia se puede firmar (`claveServible` admite `biblioteca/<espacio>/musica/`).
  · **La herramienta** importa `cancion.js` EN EL MOMENTO (lee guionAnimado.js → mercado.js: estático cerraría el ciclo
  con herramientas.js).
  · **Guardar el guion entero no se lleva la canción** (`conLaCancionGuardada` en videosProyectos.js): el formato le dice a
  Claude que no escriba `cancion`, y `guardar_video` con el guion sin esa clave la borraba (el video volvía a pedir voz).
  Sin la clave, se conserva la guardada; `cancion: null` a propósito sí la quita.
  · **Las imágenes de IA por sección de la canción (verso, coro, puente)** ya están: ver «El ESTILO del video animado».
  · **Nada de esto se ha probado contra ElevenLabs ni Gemini reales**: los tests (tests/migracion/videos.cancion.test.js)
  usan un `fetch` de mentira con la forma de su documentación. Lo primero con la llave: sincronizar UNA canción corta y
  mirar en su `canciones/…json` (o en `locucion.crudo`) qué devolvió Forced Alignment.
- **El ESTILO del video animado: el kit entero llega al guion, texto con carácter, imágenes de fondo por sección y el
  ritmo** (decisión de la agencia, con las referencias de 57DMC: «que se use el KIT DE MARCA al 100 % y que todo se construya
  sobre lo que dice la canción: su mensaje, su estilo y su ritmo»; sin migración: todo va en el JSON del kit y del guion).
  Lo que no se ve en la pantalla:
  · **Al guion le llegaba del kit sólo el personaje y «los colores por sus tokens»**: no sabía qué token era el dorado, ni el
  estilo, ni la letra, ni las reglas. Ahora `marcaParaElVideo` (src/lib/estiloVideo.js) es la versión «para el video» de
  `bloqueDeMarca`: la paleta traducida a los TOKENS del motor con su nombre y su papel (`paletaEnTokens`, con la MISMA
  `paletaDelKit` del motor: lo que dice la IA es lo que se dibuja), el estilo, la luz, la letra (y si es la del kit o la de la
  casa), lo que nunca, las reglas, lo aprendido, si hay logo, la música de la marca y, al final, el ESTILO OBLIGATORIO
  (`kit.estiloVideo`). Nada interno: ni claves de R2, ni modelos, ni presets de imagen (un test lo busca). Va en «Video nuevo»
  (`escribirGuion`) y en «Diseñar las escenas con IA» de la canción (`escribirGuionCancion`).
  · **`kit.estiloVideo` (≤ 1.500, con sus saltos de línea) y `kit.referenciasVideo` (≤ 6 claves)**: sólo se escriben si los
  hay (un kit de antes no cambia), `fundirKit` los conserva, `guardarKit` sólo acepta claves de ESE cliente y la papelera no
  borra esas imágenes (`clavesDeLaMarca`). Se editan en Marca → Kit y voz (EstiloVideoMarca.jsx). Las referencias van al
  guion COMO IMÁGENES (copias de 512 px de `miniaturaDe`) delante del pedido, con «son referencias del estilo; no se
  copian». **Si el modelo del hueco no las recibe** (un 4xx que no es la llave, el saldo ni la saturación: Muse puede no
  aceptar imágenes), se repite SIN ellas y la respuesta lo dice (`avisoRefs`); la vuelta de corrección va con las mismas que
  fueron. `ver_estudio` y el resumen del kit del director dicen el estilo de los videos.
  · **Texto con carácter** (src/lib/motorTexto.js; lo dibuja motorVideo.js): `*énfasis*` (más grande, la letra de impacto y
  el color de acento; los asteriscos no cuentan en el largo y uno SUELTO se queda como letra: un guion de antes con una nota
  al pie no cambia), `mayusculas`, el rol `gigante` (una o dos palabras por línea —las cortas con la siguiente, el énfasis en
  sus líneas— y CADA línea a todo el ancho de su caja; interlineado 1,04: con 0,94 la tilde de «MÁS» pisaba la línea de
  arriba), `porPalabra` (cada palabra aparece cuando se DICE: se casan, en orden y sin tildes, con las del habla de su escena
  —`tiemposDePalabras`—; la capa no hace su entrada entera: la hace cada palabra) y la entrada `golpe` (AL FINAL de
  `ENTRADAS`). `mayusculas` y `porPalabra` llevan `omitir`: un guion de antes valida igual. Lo de siempre (sin énfasis, ni
  gigante, ni palabra por palabra) va por el camino de antes TAL CUAL (`esTextoRico`); el reparto y la revisión miden lo nuevo
  con el mismo código (`encajarCapaTexto`; la revisión no da por «partido» un gigante).
  · **La LETRA DE LA CASA (Anton, OFL)** para el gigante y el énfasis cuando el kit no tiene letra (con letra del kit, manda la
  del kit: `impactoDe(fuentes.titular)`): `@fontsource/anton` 5.3.0, la MISMA versión en el package.json de la raíz y en el del
  Container, y el MISMO archivo (`ARCHIVO_FUENTE_CASA`, su woff2 latino: @napi-rs/canvas lo registra igual que un TTF y mide lo
  mismo, comprobado). En el navegador, FontFace desde `?url` (un asset del sitio con hash, `font-src 'self'`) SÓLO en
  motorVideoNavegador.js (el chunk del video); en el Container, `registrarLetraDeLaCasa()` al arrancar. Se pide con peso 400
  (sólo tiene ese: con 900 el navegador la engordaría a mano y no saldría como en el render). Un test exige que los dos lados
  lean el nombre y el archivo de motorTexto.js y que las dos versiones coincidan.
  · **Las IMÁGENES DE FONDO por sección** (src/lib/fondosVideo.js, worker/lib/estudio/fondosVideo.js, FondosVideo.jsx): con
  «Con imágenes de fondo» la IA pone de fondo de cada sección una `imagen` a sangre con `pide` (lo que muestra, en el estilo
  del kit) y SIN `archivo` —un FONDO POR CREAR: `archivo` ya no es obligatorio si hay `pide`, y `pide` sólo vale a sangre—;
  las escenas de una sección repiten el MISMO `pide` (una imagen para todas; como mucho `MAX_FONDOS`, 8, o se corrige en la
  segunda vuelta). Recibe además la galería del cliente (ids y lo que se sabe) por si alguna sirve, pero funciona sin ninguna.
  El guion se GUARDA así y el motor, mientras no existe, deja ver el fondo de la escena (ni marcador ni error). «Crear las
  imágenes de fondo» (`POST /api/videos/<c>/<id>/fondos`, `fondos_video` para Claude y el asistente) arma cada una como una
  pieza del lote —el modelo del cliente, 9:16, sin referencias ni logo (`conLogo: false`), `controlar: false`— con el
  DIRECTOR (`encargo` con `sinTexto`, la escena = el `pide`, la idea = el estilo del video, la indicación «sin texto ni
  logo»), dice el costo antes (409 `confirmar`; «crear sin preguntar» aplica) y crea UN encargo con `datos.fondosVideo` (de
  qué video y qué `pide` es cada paso). Un segundo pedido mientras va: 409 `en_curso`. **Al CERRARSE el encargo**,
  `avanzarEncargo` importa en el momento fondosVideo.js (estático cerraría el ciclo con herramientas.js) y
  `ponerFondosEnVideo` pone el `archivo` en las capas de cada `pide` del guion GUARDADO con `guardarProyecto` (la versión
  leída como condición; si otra persona guardó, se relee una vez): sube la versión y lo devuelve a borrador, como cualquier
  edición. Lo que una persona ya cambió no se toca; un video renderizándose no se edita (queda en la galería y se dice en
  `datos.fondosPuestos`). `tratamiento: "byn"` (opcional) los pone en blanco y negro con más contraste con `ctx.filter`
  (`FILTRO_BYN`; el Container lo hace; Safari no, y sale en color).
  · **El RITMO** (src/lib/golpes.js, container/golpes.mjs): al sincronizar una canción, el Worker le pide al Container
  `POST /golpes` (ffmpeg a PCM mono a 11 025 Hz y el análisis en JS: la energía de la señal DERIVADA en ventanas de 46 ms, su
  subida, picos sobre la media local y la autocorrelación para el BPM, llevado a 80–160). Un ataque se nota en cuanto ENTRA
  en la ventana: sin `desfase` los golpes salían 40 ms antes. Se guardan con la sincronía y con la locución (`bpm`, `golpes`;
  son del audio: el ajuste fino de la letra NO los mueve). Sin Container (en local), sin golpes y un aviso en la sincronía.
  La IA del diseño recibe el BPM y los golpes de cada línea; una capa con `pulso: true` (común a toda capa, sólo si va) late un
  4 % en cada golpe (`pulsoEn`): los golpes viajan en la LÍNEA DE TIEMPO (`conGolpes`, `linea.golpes`), la del Container (del
  pedido: `pedidoDelVideo` los manda) y la de la vista previa. Probado con señales sintéticas (vitest) y con el ffmpeg del
  sistema sobre un WAV y un MP3 (120 BPM, un golpe por bombo); `container/probarAudio.mjs` lo prueba dentro de la imagen.
  · **Nada de esto se ha probado contra Anthropic, Meta ni los motores de imagen reales**: tests/migracion/videos.estilo.test.js
  y videos.cancion.test.js usan un `fetch` de mentira (también el 400 del modelo que no recibe imágenes).
- **Los ESTILOS DE VIDEO guardados y la categoría «Video con canción»** (decisión de la agencia, tras el video de 57DMC: «guardar el
  estilo por cliente, sin código»; `src/lib/estilosVideo.js`, `worker/lib/estudio/estilosVideo.js`; sin migración). Lo que no se ve:
  · **Un estilo son REGLAS sacadas del guion, no una plantilla de escenas** (`estiloDeGuion`): el texto principal (rol, mayúsculas,
  palabra por palabra, entrada, pulso, color, si lleva *énfasis*), el apoyo y las etiquetas, los fondos (imagen a sangre, tratamiento,
  velo, movimientos y una imagen cada N escenas), las transiciones (la de DENTRO de un mismo fondo y las de AL CAMBIAR, por turnos), el
  cierre MUDO (color, el logo con su sitio y su tamaño, su transición), el grano, el ritmo, la ilustración, los subtítulos y los
  efectos. Nunca la letra, los textos ni las imágenes (un test lo busca). Un cierre que se dice es una escena más.
  · **Al crear con uno, la IA escribe el CONTENIDO y el código impone la FORMA**: `lineaDeEstilo` va en el pedido (`estiloGuardado`
  de `pedidoDeGuionCancion` y `pedidoDeGuionAnimado`) y `aplicarEstilo` se pasa ANTES de validar, también en la vuelta de corrección.
  «porPalabra» sólo se pone si las palabras del texto se dicen en esa escena (`seDiceEnElHabla`): si no, ninguna tendría cuándo entrar.
  Con fondos en el estilo, el video los pide aunque no se marcara «con imágenes de fondo», agrupados por su cadencia (una imagen para
  cada N escenas seguidas, la del primero del grupo; la escena sin fondo recibe el del grupo); el código no INVENTA ninguno.
  · **El tope de fondos por video pasa a 16 con un estilo** (`TOPE_FONDOS_ESTILO`; sin estilo la IA sigue con 8) y el encargo de
  `fondos_video` crea hasta 16 de una vez (antes 8: el de 57DMC necesitó dos encargos). La cadencia sube sola si pasaría del tope.
  · **Vive en el kit pero sólo lo escriben sus rutas**: `guardarKit` conserva los guardados salvo con `conEstilos: true` (el PUT de
  otra pestaña con el kit de antes no se los lleva) y `fundirKit` los conserva. Hasta 8 por cliente, nombre único.
  · **La categoría**: «Con canción» en las formas de video del Estudio (FlujoReel) y «Video con canción» en la pestaña Pieza de un reel
  o una historia (entre las principales si el cliente tiene un estilo para canciones; si no, en «Más formas»): abren VideoAnimado con
  `inicio="cancion"` (directo en «Video nuevo» con la canción) y el selector escoge su estilo. Receta de la casa «video-con-cancion».
  · El video recuerda con qué estilo se hizo (`origen.estiloId`); un estilo sin efectos crea el video con `sonido.efectos: false`.
  · Claude: `estilos_video`, `guardar_estilo_video`, `aplicar_estilo_video` (una versión nueva en borrador) y `estilo_id` en
  `video_con_cancion` y `crear_video`. **Nada de esto se ha probado contra Anthropic real**: los tests usan un `fetch` de mentira.
- **Las reglas del MÉTODO DE AGENCIA para video, hechas código** (la primera prueba completa de un video animado y un reel
  por planos dejó 25 reglas; las que el código puede cumplir solo, aplicadas para todos los clientes; no cambian cómo se ve
  un video que ya salía bien). Lo que no se ve en la pantalla:
  · **La VOZ manda en lo que dura una escena con habla** (`lineaDeTiempo`): ni el `hasta` de un clip ni el `dura` de una
    imagen la alargan, porque eso metía silencio a mitad de una oración (el reel de prueba bajó de 29,9 a 24,6 s con la
    misma voz). El silencio sólo va donde hay `pausa`, o tras una escena demasiado corta que CIERRA una oración
    (`cierraOracion`). Sin habla, lo de siempre. Si la frase dura más que su clip, la revisión avisa `clip_corto` (grave).
  · **El MONTAJE de un reel no pierde ninguna frase** (`guionDeMontaje`): un plano sin clip (no salió, o su toma es «fija»)
    va con su FOTOGRAMA revisado a sangre y un movimiento suave (`fuente.fotogramas`); sin fotograma, con su texto sobre el
    fondo. La frase que no cabe en su clip (clip − `MARGEN_CLIP`, 0,5 s) se PARTE por palabras (`partirEscenasLargas`, la
    segunda parte con el fotograma y, en el cierre, el logo y el llamado), primero con los tiempos estimados y, tras la
    voz, con los de verdad (fase «ajustar» del montaje: guarda, vuelve a aprobar y la voz sigue valiendo porque lo que se
    dice no cambia). Con un solo video, el video corre SEGUIDO (`ajustarMontaje` con `continuo`). `comprobarMontaje`
    exige que el montaje diga TODO lo del reel y lleve el gancho: si no, error grave y no se sigue. Los efectos de
    transición van apagados sobre clips reales (y la música de la marca se queda: `crearProyecto` funde el sonido pedido
    sobre el de siempre).
  · **El reel por planos es barato por defecto**: 4 planos hasta 20 s y 6 en 30 s (`planosPorDefecto`; `planos` pide más);
    la IA marca la `toma` de cada plano («fija»: producto, beneficio, cierre; «movimiento»: personas o acción) y, con
    montaje, la fija NO paga clip (`clip.fase` «omitido»); los clips van con Veo 3.1 Lite por Kie (`PREFERIDOS_CLIPS`,
    `CLIPS_POR_DEFECTO`: con su llave toda duración va por clips y montaje). El producto «malo» del problema se pide
    genérico, de otro color y sin nada de la marca. `crear_reel` se PARA tras el storyboard por defecto (`revisar` true).
    El plan dice lo que se ahorra frente a la opción cara (`textoDelAhorro`) y, si va por Kie, compara con su SALDO
    (`saldoKie`, `GET /api/v1/chat/credit`, no gasta): si no alcanza no se crea nada, y un 402 de Kie dice el saldo y de
    qué cuenta es la llave (sus últimos 4). `estado_reel` dice qué clips no salieron y por qué (`lineaDeClips`).
  · **Fiel a la marca**: el guion del video animado recibe SÓLO el producto del video (`catalogoConFotos(…, soloIds)`, el
    de la publicación o el pedido) y un precio que no es suyo ni de la idea es un error que corrige la segunda vuelta
    (`erroresDePrecio`, src/lib/fidelidad.js; `cantidadesDe` vive ahí y revisionMes.js la reexporta). El LÉXICO de la
    marca (`kit.lexico`, src/lib/lexico.js: «fibras de bambú ← bambú») lo aplica el CÓDIGO a lo que se dice y se lee: al
    guardar un video animado (`guionConLexico` en crearProyecto y guardarProyecto; en un video con canción sólo a lo que se
    lee; si un texto pasaría de su tope, no se toca y se avisa) y al escribir el reel (`aplicarLexicoAlReel`). Sólo lo
    cambia su ruta (`PUT …/kit/lexico`, `guardarLexico`, Marca → Kit y voz) o `lexico_de_marca`: el PUT del kit lo conserva.
    `voz_de_marca` fija la voz de la marca por MCP y `voz` en crear_reel, continuar_reel y montar_reel la cambia para uno.
  · **El video animado**: con dos capas o más que se reparten, unas x/y pasan a la zona más cercana (`zonaMasCercana`, con
    aviso; el logo, el sello, el dibujo, la forma y lo que va a sangre las conservan). La MASCOTA de la marca
    (`kit.personajeVideo.imagenes`, una imagen por pose; `personaje_video` con `imagenes`) se dibuja en vez de la figura de
    la casa (`imagenDePose`; `archivosDelGuion` la carga). El texto en pantalla no se pinta como titular si repite el número
    de una cifra (`repiteUnaCifra`). La revisión avisa además `producto_pequeno`, `logo_sobre_cara` (el logo sobre el
    personaje o una foto de una persona), `textos_repetidos` y `escena_cargada` (producto, precio y logo juntos).
  · **El render y la vista previa**: un render que el Container corta («signal 15») se repite UNA vez con los clips subidos
    otra vez (`esCorteDelContainer`); subir un clip o una imagen al Container se reintenta una vez tras 1 s (no sale como
    faltante algo que está en la galería); y el cuadro de un clip pegado a su final, si ffmpeg no lo encuentra, se pide
    un poco antes (`cuadroDe`).
  · **Lo que se dejó fuera**: el «banco de tomas» (reutilizar clips y fotogramas aprobados entre reels) y llenar el cerebro
    desde el repositorio de la agencia sin pasos manuales.
- - **«Publicar con música»: sin animación, música generada MIRANDO la imagen y el carrusel en reel** (decisión de la
  agencia; src/lib/conMusica.js, worker/lib/estudio/conMusica.js, calendario/ConMusica.jsx). Lo que no se ve:
  · **«Sin animación»** es el movimiento «ninguno» (la foto quieta con la música).
  · **«Una nueva, generada con IA»** (`musicaId: "generar"`): el proyecto se crea y se aprueba SIN música y se pide a Suno
  por `pedirMusica` con el video: el DIRECTOR MUSICAL ahora MIRA las imágenes del video (`imagenesDelVideo`, hasta 3 copias
  de 512 px de sus capas de imagen; si el modelo no las recibe, sin ellas) y, si el video no tiene voz, sabe que la música
  es lo único que suena. Sin `confirmado`, el 409 `confirmar` con el costo y su propuesta (la pantalla lo enseña y pide el
  sí). Con el sí, `origen.renderSolo`: cuando la música llega a su sonido (`terminarMusica`) o la voz está lista
  (`terminarAudio`), `renderSiToca` encarga el render SOLO (una vez: luego apaga la marca). Ambos lo importan en el momento
  (estático cerraría un ciclo).
  · **Un CARRUSEL en reel** (`carruselAReel`, `reel: true` en POST /api/videos/<c>/con-musica; `guionDeCarrusel`): una
  escena por lámina a sangre (entera si no es vertical), la transición escogida (la primera entra con corte), el movimiento
  que alterna o uno fijo, de 2 a 5 s por lámina (y al menos 5 s en total), el logo en la última y la música de la biblioteca,
  generada o ninguna. Con `voz`, la IA escribe UNA frase por lámina con lo que dice la publicación (`pedidoDeVozCarrusel`,
  texto) y la voz de la marca la dice con subtítulos (`pedirLocucion`: SIEMPRE con su confirmación; el 409 trae `hablas`
  para leerlas antes de pagar, y el «sí» REUSA las mismas frases); cada lámina se ve al menos sus segundos (lo que falta a
  su frase va de `pausa`). Voz y música generada no van juntas (dos confirmaciones). Al terminar, el render lo pone como reel
  con la primera lámina de portada y `post.conMusica.medios` guarda las láminas: «Volver al carrusel» (`volverALaFoto`) las
  devuelve. `origen.tipo` «carrusel» es otro `esVideoDeFoto`. Lo mismo para Claude: `publicar_con_musica` con `reel`,
  `transicion`, `voz` y `confirmado`. **Nada de esto se ha probado contra Suno, ElevenLabs ni el Container reales.**
- **Claude hace videos FUERA del calendario y los deja aquí: subir, la voz suelta, sus tiempos y el kit en un ZIP**
  (decisión de la agencia, tras un reel de Baby Caleb armado por Claude con Python, PIL y ffmpeg que quedó mejor y gratis;
  `worker/lib/estudio/subidaClaude.js`, `sonda.js`, `worker/lib/kitDescargable.js`). Lo que no se ve:
  · **`subir_a_galeria`**: con `url` el servidor la baja con `abrirDescarga` (https, `Content-Length` obligatorio, el tipo
  por los bytes). Sin `url`, un enlace `PUT /api/subir/<testigo>` (antes de la sesión en worker/index.js) firmado con el
  secreto de la vista (uso «subir-galeria»), 15 minutos y UN uso: el id de la ficha ES el del enlace, así que si ya existe
  contesta 409. El testigo lleva el espacio, el cliente, la persona y sus `clientes` (un colaborador sube sólo a los suyos).
  Se guarda en R2 POR FLUJO (`guardarDescarga`, `FixedLengthStream`): un mp4 de 90 MB no cabe en la memoria del Worker.
  Topes: video 95 MB (el cuerpo de una petición a Cloudflare no pasa de 100), imagen 15, audio 20. Sólo MP4/MOV, PNG, JPEG,
  WebP, MP3, WAV y M4A (`tipoPorBytes`): nunca SVG ni HTML, que se ejecutarían en este origen. Un formulario (multipart) se
  rechaza: el archivo va tal cual (`curl -T`). La ficha: `origen: "subida-claude"`, `subido: 1` (la papelera puede borrar
  su objeto) y, un audio, en la biblioteca de sonido por su `uso` (musica-subida, efecto-subido o `voz-subida`, que no es de
  la biblioteca). La ficha se crea con la SUBIDA: `confirmar_subida` sólo comprueba y, con `publicacion_id`, la pone por
  `ponerPiezasEnPost` (la regla de la portada de un reel incluida).
  · **Medidas y duración sin ffprobe** (`sondearEnR2`): de R2 por RANGOS. Un MP4 puede llevar su `moov` al FINAL (sin
  faststart): se recorren las cajas de primer nivel leyendo 16 bytes de cada una y se lee `moov` entera (≤ 8 MB); `mvhd`
  da la duración y el `tkhd` de la pista «vide» las medidas, cruzadas si la matriz gira 90°. La duración va en
  `ajustes.duracion` y `medioDeArchivo` (galeriaPura.js) la pone en el medio del post (`duracion`): Shorts y TikTok la leen.
  · **La locución SUELTA** (`generar_locucion` con `texto` y sin `video_id`; `pedirLocucionSuelta`, ajustes `para:
  "suelta"`): la toma de siempre, confirmada siempre, hasta 5.000 caracteres; `terminarAudio` guarda en su ficha
  `ajustes.palabras` con la palabra AL LADO (`tiemposDeLocucion` da sólo desde y hasta). **`tiempos_locucion`** los da: de
  una suelta, en segundos del audio; de un video, por escena y en segundos DEL VIDEO (con los silencios insertados) desde
  `lineaDeTiempo`, que es lo mismo con que el motor ancla `{ palabra: n }`.
  · **`kit_descargable`**: el ZIP se arma al abrir el enlace (como exportar_piezas: `zipPorFlujo`), releyendo kit y catálogo
  por la capa de acceso; sólo claves de ESE cliente y la música de la agencia de ESTE espacio. Uso del testigo «kit-zip»:
  uno de exportar_piezas no abre un kit ni al revés. `paleta.json` lleva los tokens de `paletaDelKit` (los del motor).
  · **`"maquetacion": "exacta"`** (raíz del guion o escena; opcional y sin escribirse si no va): las coordenadas de varias
  capas ya no se pasan a zonas (`validarEscena`) y una capa con `{ x, y }` mide su `tam` exacto (`anchoPedido` con
  `c.exacta`: sin el mínimo de columna del texto ni el del logo del cierre). Los subtítulos conservan su franja.
  · **Lo que se dejó fuera, a propósito**: la capa `html`/JS (Chromium en el Container, aislar código de la IA en el
  servidor y en la vista previa con la CSP de hoy) y las plantillas con variables y los videos en lote. Con lo de arriba,
  Claude ya hace eso en su máquina.
- **El VIDEO: desglosar toma por toma, seguir su forma, «¿listo para animar?» y pedidos cortos** (`src/lib/deconstructor.js`,
  `listoAnimar.js`, `pedidoVideo.js`; `worker/lib/estudio/deconstructor.js`, `listoAnimar.js`). Cosas que no se ven:
  · **El desglose es CARO (tokens de video) y sólo a pedido**: `POST /api/estudio/<c>/archivos/<id>/deconstruir`, «Desglosar
  toma por toma» del visor y `deconstruir_video` (Claude y el asistente; con `video_referencia` en `crear_reel`). Queda en
  `ajustes.deconstruccion` de la ficha y la segunda vez sale gratis, salvo `otraVez`. Con Meta como motor de video va por
  fotogramas (409 `fotogramas` y el navegador repite; por MCP lo dice) y lo marca: sin audio, tomas aproximadas. La IA
  describe; lo demás lo cuenta el CÓDIGO (`leerDeconstruccion`: las tomas ordenadas y contiguas, la media, el ritmo de los
  cortes) y quita las palabras de valor que se le escapan («elegante», «cinematográfico»…: `limpiadas` dice cuántas).
  · **Seguir la forma es seguir el MAPA RESUMIDO, nunca el video**: `guionDeReel` lo lee del video de una referencia del
  estudio de mercado (`ref.archivoId`) o de `videoReferenciaId` (uno de la galería; escogido sin desglose, 400 sin llamar a
  la IA) y el pedido lleva `resumenDeSecuencia` (≤ 1.800, hasta 12 tomas y el resto contado) con «nunca su marca, sus
  personas, su texto ni lo que dice». El video animado de «Recrear para…» de «Lo mejor» lo sigue (cada toma, una escena):
  por eso el original se trae ANTES de escribir el guion (bajarlo no cuesta; un TikTok cuya dirección caducó gasta su
  crédito de Scrape Creators como antes, aunque el guion falle después). Nada se desglosa solo: sin desglose, como antes.
  · **«¿Listo para animar?» retrasa UN paso el cierre del reel** (`porRevisarAnimar` en `reelTerminado`): cuando el encargo
  se para a revisar, la IA mira las copias de 512 px (Container; sin él, la original si es PNG/JPEG de ≤ 1,2 MB: las
  tarjetas SVG del motor de prueba no se miran) en una llamada. El resultado va en `p.animable` (con el id del fotograma
  mirado: uno corregido después ya no lo lleva) y en `ajustes.animable` de la ficha, que es lo que lee la pantalla. Sin IA,
  sin copias, si falla o al cerrarse por plazo, `datos.animable` lleva `error`/`omitido` y el encargo se cierra igual: es un
  aviso, nunca bloquea `continuarReel`.
  · **Un pedido de video no se corta por el final** (`armarPedidoVideo`): lo fijo —el formato y la duración, que Omni lee del
  texto; la voz entre comillas; `SIN_TEXTO_VIDEO`— no se toca; primero se COMPRIME lo que pasa de su `TOPE_PARTE` (el bloque
  de la marca, que llegaba entero hasta 3.000) y luego se corta al revés: sonido, movimiento, cámara, luz, acción y, lo
  último, el sujeto. Un storyboard mide `limiteDeStoryboard` (1.000 + 250 por plano, hasta 2.500): con 1.000 para todo, un
  reel de cuatro planos perdía los últimos. Con un kit largo, el estilo de la marca queda en ~240 caracteres en el pedido de
  video, a propósito.
  · Funciones nuevas en el hueco «análisis»: «desglose de video» y «fotograma listo para animar». **Nada de esto se ha
  probado contra Gemini, Meta ni Anthropic reales**: los tests usan `fetch` de mentira.
- **«Mejorar mi video» y «Varios ángulos de una toma»** (`src/lib/mejoraVideo.js`, `worker/lib/estudio/mejoraVideo.js`,
  `container/unir.mjs`, `components/MejorarVideo.jsx`; `mejorar_video` del MCP). Cosas que no se ven:
  · **El AUDIO ORIGINAL se pone después, siempre**: Omni 1.2 y Seedance 2.5 inventan su sonido y Topaz puede devolver el video
  mudo. Lo que sale del modelo es un paso intermedio (queda en la galería); lo que se entrega es la UNIÓN del Container
  (`/unir`), que queda como VERSIÓN del original (`ajustes.deArchivo`, `audioOriginal: true`). Un tramo va sin recodificar
  (`-c:v copy`, se corta a lo más corto); los ángulos sí se codifican (libx264) y se encajan llenando, sin bandas.
  · **La unión NO se hace dentro del paso del encargo**: el permiso del encargo dura 240 s y `avanzarEncargo` escribe al final
  con ese permiso como condición. Se encarga al Durable Object del render (`idFromName("mejora-<encargo>")`, su alarma de
  15 min y sus 2 vCPU) y el encargo mira en los pasos siguientes (`GET /unir?intento=`). El resultado vive en el storage del
  objeto, no en la fila: si la alarma escribiera `datos`, el siguiente paso lo pisaría. Sin noticias en 20 min, fallida.
  · **El encargo no se cierra hasta saber cómo acabó la unión** (`unionTerminada` en `listos`). Si falla, queda «hecho» con lo
  del modelo y el motivo en `mejora.union.error` (la campana lo dice); un corte del Container se reintenta una vez.
  · **Una mejora la arma el SERVIDOR**: `crearEncargo` rechaza `tipo: "mejora"` si no viene de `crearMejora` (`interno`), que
  comprueba que el video y las fotos sean de ese cliente y pregunta el costo SIEMPRE (409 `confirmar` con `resumen`).
  `/api/estudio/<c>/mejorar` ya era «mejorar el prompt»: la ruta es `/mejorar-video`.
  · **Duración**: se mide de `ajustes.duracion` o leyendo la caja `moov` en R2 (`sondearEnR2`, también vale para MOV). Look,
  cambiar y ángulos: hasta 15 s con Omni 1.2 (a 1080p, casi lo mismo que 720p), de 15 a 30 s con Seedance 2.5 (sigue el
  video de REFERENCIA: puede cambiar más que Omni). Topaz admite cualquier duración hasta 50 MB y se cobra por segundo: el
  catálogo supone 15 s (`segundos`), el plan cobra lo que dura de verdad.
  · **Ángulos**: cada uno recrea la misma toma desde otra cámara y el montaje salta cada `CORTE_ANGULOS` (2 s) empezando por
  el original. Un ángulo que no salió deja su tramo al original. Si alguien habla a cámara la boca no coincide: se avisa.
  · **Omni 1.2 (`gemini-omni-1-2-kie`) y Topaz (`topaz-video-kie`) salen de lo que devolvió la BÚSQUEDA** (docs.kie.ai no se
  alcanza desde aquí): el extracto lleva la entrada de Omni 1.2 marcada así. Omni 1.2 pasó a ser el primero en las listas de
  preferencia (reel, tramo, recrear); como no tiene `audio_ids`, la voz fija de Omni sigue siendo cosa del 1.1. **Nada de esto
  se ha probado contra Kie** (la unión sí, con ffmpeg: `probarUnir.mjs`); el precio de Topaz es una suposición por lo alto.
  · **La primera prueba real (17-11-2026) falló al crear la tarea**: en Omni 1.2 `video_list` es una LISTA DE DIRECCIONES
  (`["https://…"]`), no `[{ url, start, ends }]` como en el extracto del 1.1. Corregido; el 1.1 sigue con objetos (sin probar).
- **Color, ganchos, entrada y cierre con IA, alargar y plantillas de movimiento gráfico** (17-11-2026; `src/lib/
  mejoraVideo.js`, `coloresVideo.js`, `plantillasVideo.js`, `container/unir.mjs`, `NuevosGanchos.jsx`,
  `CrearConPlantilla.jsx`). Cosas que no se ven:
  · **La unión trabaja por VERSIONES** (`union.versiones`): cada una es un video de la galería, versión del original.
  Un tramo es un trozo de UN clip con SU audio (`audio: { fuente, desde }`; por defecto el del original en ese segundo, que
  es lo que necesitan los ángulos). Lo de antes (`union.tramos`) se lee como una versión (`versionesDe`).
  · **Lo gratis no pregunta y no necesita Kie**: el color y los ganchos con el momento fuerte no tienen pasos (el encargo
  se juzga por su unión: `listos` admite una mejora sin pasos). Las muestras de color salen del Container de los cuadros.
  · **Entrada, cierre y alargar parten de un FOTOGRAMA del original** (`fotograma:<s>` en el plan; `crearMejora` lo saca
  con `/fotograma` y lo deja en la galería con `ajustes.fotogramaDe`). Sin Container, 503 antes de cobrar nada. La entrada
  nueva lleva sólo la imagen FINAL: `seedance-2-5-kie` tiene `soloFinal` (`validarPedido` lo admite). **Sin probar contra
  Kie** si Seedance 2.5 acepta `last_frame_url` sin `first_frame_url`: si no, el error lo dirá al pedir.
  · Seedance 2.5 admite ahora más duraciones (18, 22, 25, 28, 4…): un video de 21 s ya no paga 30.
  · **Los textos de los ganchos** los escribe la IA con las FORMAS DE GANCHO del método (sólo las de pauta y video, sin las
  que piden un dato) en la función «guion de video»; con el video desglosado, también escoge el MOMENTO FUERTE. Por MCP no
  se ofrece: Claude los escribe él (`mejorar_video` con `textos`).
  · **El texto del gancho** se dibuja en un PNG (letra de la casa, placa con la paleta del kit) y se superpone con ffmpeg
  los segundos del momento + 1,2 s. Va en el tercio de arriba, lejos de los botones de Instagram.
  · **Plantillas**: sin voz; cada escena dura su `pausa` (≤ 3 s) o lo que `dura` una foto (los cortes rápidos del logo y
  del producto, ≥ `MIN_ESCENA`). Dos componentes nuevos del motor: `comentario` y `busqueda` (motorComponentes.js); la
  búsqueda se escribe a 16 letras por segundo (más rápido si es larga: nunca más de 1,2 s, o los resultados —con el remate
  de la marca— no llegaban a salir en una escena muda de 3 s; pasó en el primer video real) y achica la letra para caber.
  · **Un signo pegado al cierre de un énfasis** («*café*,», «*esperar*?») salía separado («café ,»): `partirEnfasis` lo
  pega a la palabra enfatizada. Sobre un fondo claro la tarjeta blanca no se
  veía: la primera escena va sobre el acento y el oscuro de la marca.
  · **Predictor de viralidad (Higgsfield), descartado**: cuesta créditos de Higgsfield (la agencia no los compra), no se
  puede reproducir aquí y «¿Está listo este video?» ya revisa el gancho y la retención con el método de la agencia.
  · **Omni 1.2 por Kie, editando un video de 12 s a 1080p (17-11-2026), falló DOS veces con «generate task timeout»**
  (del lado de Kie, ya con el pedido aceptado: el formato es el bueno). Sin un resultado todavía, no se sabe si es el modelo
  recién salido, la edición a 1080p o la duración. Si sigue pasando: probar a 720p o un video más corto antes de culpar al
  pedido; Seedance 2.5 (de 15 a 30 s) es el otro camino para «look» y «cambiar algo».
  · **El movimiento gráfico (17-11-2026): transiciones que mueven las DOS escenas, fondos vivos, cámara, viñeta, letra
  cinética y resalte del énfasis** (`docs/formato-escenas-v1.md`, «El movimiento gráfico»). Lo que ya pasó al hacerlo:
  el marcador del énfasis en acento sobre un fondo del acento (rojo sobre rojo) no se veía, igual que las viñetas de una
  lista: el motor pasa ese acento al claro u oscuro que contrasta (`visibleSobreElFondo`). Un marcador del alto estimado
  dejaba asomar las mayúsculas de impacto o pisaba el renglón de abajo de un gigante (blanco sobre blanco): se mide con
  `actualBoundingBoxAscent/Descent`. La máscara de línea, si se queda puesta, corta la tilde de «SÍ»: sólo recorta
  mientras sube. Una malla con un TERCER color salía sucia (rojo y dorado sobre negro = marrón; acento sobre crema =
  mancha rosa): sólo usa `color2` y un brillo. El desenfoque es `ctx.filter` por llamada (no hay desenfoque direccional en
  Canvas 2D); en Safari no existe y la vista previa sale sin desenfoque (el render sí lo lleva). Un render de 17 s con
  seis transiciones tarda ~35 s en el Container. Sin voz, la duración de cada escena es su `pausa` (máx. 3 s): para cortar
  en el bombo hay que medir la canción (sus golpes) y poner las pausas en múltiplos del pulso; un `golpe`/`glitch`
  impacta a mitad de su `dur`.
  · **Tras desplegar, el Container sigue con la imagen VIEJA mientras esté despierto** (17-11-2026): el Worker ya
  aceptaba `malla` y `latigo`, pero `revisar_video` (que corre en el Container) los rechazaba con la lista de antes.
  Cloudflare sólo arranca la imagen nueva cuando la instancia se duerme (2 min sin pedidos el de los cuadros; 30 s el
  del render) y otro pedido la despierta: pedirle cosas seguidas la mantiene en la vieja. Si justo tras un despliegue
  el Container no conoce algo nuevo, deja de llamarlo 3 minutos y vuelve a probar. Y `editar_escena` tiene su propia lista
  de campos (`CAMPOS_ESCENA`): un campo nuevo de la escena va ahí también (lo vigila videos.camposEscena.test.js).
- **Los EFECTOS DE SONIDO por evento: un catálogo propio, una lista anclada a lo que pasa y «escuchar» sin oídos**
  (17-11-2026; `src/lib/catalogoEfectos.js`, `efectosColocados.js`, `efectosSonido.js`, `escucharSonido.js`,
  `container/efectos.mjs`, `container/escuchar.mjs`, `worker/lib/estudio/escuchar.js`, `scripts/efectos/`). Se estudiaron
  earshot (github.com/Leonxlnx/earshot) y real-sfx de Clipwing (github.com/Clipwing/skills): NO se subió su código. Cosas
  que no se ven en la pantalla:
  · **El catálogo son archivos de la aplicación, no filas**: 283 MP3 en `public/efectos/v1` (2,6 MB; 236 de earshot, los que
  pasan SU auditoría —16 no—, y 47 de uisfx, el paquete «studio» sin los que suenan en bucle). Se sirven como estáticos y la
  imagen del Container los COPIA (`COPY public/efectos` y su excepción en `.dockerignore`: sin ella, el render se quedaba
  sin catálogo y sonaban los sintetizados). Los datos (`catalogoEfectos.datos.js`) los GENERA
  `scripts/efectos/armar-catalogo.mjs` y no se editan a mano. Un id NO se renombra: las listas guardadas lo usan.
  · **El banco de earshot se renderiza SIN sus modelos** (sólo numpy, scipy, soundfile y soxr; ni torch ni 1,1 GB de CLAP y
  AST): 252 sonidos en 17 minutos de CPU, una vez. Sus «oídos» (los modelos) no van a Cloudflare: en una mezcla aciertan qué
  es un sonido la mitad de las veces (su propio LIMITS.md); lo fiable son las MEDIDAS, que ffmpeg y el código ya sacan.
  · **El pico de un efecto es el primer instante a 1 dB del más fuerte**, medido sobre el MP3 decodificado como lo hace el
  Container (el mismo `muestrasDeEfecto`). Con la ventana más fuerte a secas, uno con meseta (una subida que se sostiene)
  saltaba hasta 220 ms entre el WAV y el MP3. Aun así, tres (riser-build, toggle-rocker, whoosh_big-gust) tienen la meseta
  ambigua: como el render mide el mismo MP3, cae siempre igual.
  · **Con lista, los automáticos callan** (si no, el whoosh de una transición sonaría dos veces); `[]` los devuelve. Y los
  automáticos ahora son del catálogo (`EFECTO_AUTOMATICO`: whoosh_fast-crisp, pro_impact-air para un golpe o un glitch y
  ui_pop-soft), con las mismas reglas: el pico del whoosh 37 ms DESPUÉS del corte (antes, centrado en él); el impacto, por
  su arranque en el destello (la mitad de la transición, con `ajusteMs`) y 5 dB más (`REALCE_IMPACTO`: lo grave se oye
  menos). Los sintetizados (whoosh, impacto y pop) quedan de respaldo si un MP3 no se lee.
  · **El nivel de un efecto es el más alto de dos reglas**: el de siempre (12 dB bajo la voz, movido por su papel) y sus dB
  medidos SOBRE la música del segundo de antes (la mediana de ventanas de 50 ms, medida ANTES de bajar la música). Sin la
  segunda, un efecto en un hueco sin voz quedaba 3 dB por debajo de la música. Techo: 6 dB bajo la voz; con la música a 9 dB
  bajo la voz en los huecos, un efecto ahí llega a +3 dB sobre ella. Para más, `volumen` a mano (pasa el techo).
  · **Lo que no se ha medido lo dice**: los papeles brillo, firma, glitch, interfaz y propio llevan una regla prudente
  (`medido: false`); la densidad de earshot (18 a 30 efectos cada 10 s con locución) es de películas de PRODUCTO, no una meta
  para un reel de marketing: el informe la enseña y sólo avisa si se pasa.
  · **Guardar no pisa nada**: un PUT del sonido sin `colocados` (la pantalla de antes) conserva la lista; quitar de la
  biblioteca un efecto que usa la lista es un 409 (`usa` mira también `colocados`). El Worker sólo manda como sustituto de un
  automático el efecto de la biblioteca que PUDO leer: así el Container no avisa dos veces.
  · **Escuchar va al Container de los cuadros, no al del render**: no espera a la cola de renders y tarda 1,5 s (30 s de
  video). Sirve ANTES de la voz (tiempos estimados, y lo dice): se coloca, se escucha, se corrige y sólo al final se paga el
  render. La hoja es un PNG de unos 250 kB que va en el JSON (la pantalla la pinta como `data:`; `img-src` la deja).
  · **Sin voz ni música el audio no se normaliza**, como antes: los efectos solos quedan a su nivel bajito.
  · Lo probado: las reglas, la mezcla y el informe (vitest), el Container en local con el ffmpeg del sistema
  (`probarAudio.mjs` y `probar.mjs`: cada efecto suena en su instante; /escuchar da informe y hoja) y la pantalla «Sonido» en
  Chromium (la lista, «Quitar la lista», «Escuchar el sonido»). NO probado: el render en Cloudflare con el catálogo en la
  imagen, la hoja vista desde el chat de Claude, y si los efectos de earshot SUENAN bien: eso lo dice una persona en los
  momentos que marca el informe (su prueba a ciegas fue de un oyente y 15 intentos).
- **Los efectos AUTOMÁTICOS sonaban siempre a los mismos tres** (17-11-2026; `colocadosAutomaticos` en
  `src/lib/efectosColocados.js`). Un whoosh para toda transición, un impacto y un pop: lo primero que se oye como
  plantilla (lo dijo la agencia escuchando dos videos seguidos). Ahora:
  · Cada TIPO de transición suena a su familia (`SONIDOS_DE_TRANSICION`: empuje, un barrido grave; cortina, un paño;
  círculo, un respiro que se abre; persiana, un paño o un obturador; golpe, un impacto…), con su contador PROPIO: la
  primera vez de cada tipo, su variante más suya; las siguientes rotan. Con un contador global, la primera persiana del
  video caía en «obturador».
  · El whoosh de una transición que se MUEVE cae en su mitad (lo más rápido del movimiento), no en su primer cuadro.
  · Un `golpe` lleva tres capas (`CAPAS_DEL_GOLPE`): la subida que TERMINA en el destello, el impacto y un grave debajo.
  Antes del destello ya no hay silencio (container/probarAudio.mjs lo comprueba así).
  · Lo que entra suena (`SONIDOS_DE_CAPA`): el logo (firma), cada ítem de una lista en madera y el último de una lista
  numerada como confirmación, la búsqueda (tecleo y cada resultado, el último con campanita, con el mismo tiempo que dibuja
  el motor), el «después» de un antes y después, el comentario, una cifra, un icono y el marcador del énfasis.
  · Los ADORNOS (marcador, cifra, icono) callan si un principal suena 0,5 s antes o 0,25 s después: se amontonaban sobre
  la cola de un impacto. Y «dos a menos de 0,15 s» es por clase: un whoosh y el pop del sello que entra con él suenan los
  dos (antes, uno se comía al otro).
  · Medido con «escuchar» en los dos videos de Feria del Lente: 11 y 13 efectos cada 10 s, sin avisos de pisarse. El gusto
  no se ha comprobado con oídos: lo dice una persona.
  · El conector MCP de una sesión de Claude que se abrió ANTES de desplegar `colocados` no lo tiene en su esquema y lo quita
  sin avisar (sonido_video dice «Guardado» con los automáticos). Para poner una lista hay que abrir una sesión nueva o usar
  la pantalla «Sonido».
  · **El Container de RENDER también sigue un rato con la imagen vieja tras desplegar** (17-11-2026): el primer render de
  después del despliegue salió con los efectos automáticos de antes, aunque el Worker ya era el nuevo y hacía más de 30 s
  que no se renderizaba. Cinco minutos después, el mismo render salió con los nuevos. Cómo se supo, sin oídos: renderizar
  en local el mismo guion y la misma música con el código nuevo y con el viejo, y correlacionar la envolvente del audio
  con el mp4 de producción (1,000 con el que lo hizo, 0,775 con el otro). Tras un despliegue que toca el audio o el
  motor, espera unos minutos antes de renderizar lo que se va a entregar, y compruébalo así.
