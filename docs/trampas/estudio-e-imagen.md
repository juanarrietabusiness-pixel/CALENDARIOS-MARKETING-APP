# Trampas conocidas · El Estudio: imágenes, director, kit y galería

**Qué cubre:** Trabajos y encargos, la bomba, motores (Google, fal, Higgsfield, Kie, Muse), el kit de marca, el director de arte, el lote, carruseles, control de calidad, logo, plantillas, versiones, la galería y la papelera.

**Cuándo leerlo:** Antes de tocar `worker/lib/estudio/` (salvo video), `src/components/Estudio*.jsx`, la pestaña Pieza o la galería.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- **El asistente crea imágenes y videos POR EL ESTUDIO y los entrega en el chat** (`generar_imagen` con `tipo`, `estilo`,
  `confirmado`; `src/lib/piezaChat.js`). Con un cliente abierto va por el camino de UNA pieza (kit, logo, fotos del
  producto que nombra, modelo fijado) y el navegador espera el trabajo; desde 0,50 $ devuelve «NO SE CREÓ NADA» con la
  cifra y sólo con el «sí» se repite (salvo «crear imágenes sin preguntar» del espacio: ver «La confirmación de 0,50 $ se
  puede fijar»). Sin cliente, la imagen de Gemini de siempre. El video llega como `[[video: clave]]`.
- **El Estudio: una imagen es un TRABAJO, y el Worker no puede esperar.** Pedir crea
  una fila (`estudio_trabajos`) y cada `POST …/avanzar` da UN paso —una imagen—, que
  guarda su avance; lo avanza el navegador mientras se mira la pantalla y el cron
  (`avanzarPendientes`, sólo si no hubo nada que publicar, medir ni informar; detrás de él sólo va Inspiración)
  para lo que nadie mira. Cosas que no se ven mirando la pantalla:
  · **Un paso a la vez, y no es un detalle:** dos que avancen el mismo trabajo generan y
  COBRAN la imagen dos veces. El permiso es `bloqueado_hasta`, reservado con el valor que
  se leyó como condición del UPDATE (el segundo no cambia ninguna fila) y soltado al
  terminar; si el Worker muere a medias, caduca solo. `updated_at` NO sirve de permiso:
  se pone al día en cada escritura y dos pasos seguidos parecerían el mismo.
  · **El archivo se guarda en R2 y en la galería ANTES de tocar el trabajo,** y el trabajo
  apunta su id: un paso repetido tras un fallo a medias no cuenta dos veces lo mismo. Un
  fallo pasajero (saturación, red) se reintenta solo `MAX_INTENTOS` veces; un trabajo con
  parte entregada que falla termina `hecho` con la nota «Llegaron 1 de 3: …» y cuesta sólo
  lo entregado. Nada se queda «en marcha»: tiene plazo (30 min) y acaba `fallido` con el motivo.
  · **Lo que llega del motor se reconoce por sus primeros bytes** (`tipoPorBytes`), no por el
  tipo que declare: un HTML disfrazado de PNG se rechaza. La tarjeta de prueba es un SVG
  y sólo la fabrica el propio Worker; `sirveMedia` pone `Content-Security-Policy: sandbox`
  a todo SVG, porque abierto suelto ejecutaría sus scripts con la sesión de la agencia.
  · **Las referencias las manda el navegador y no se creen:** `claveDelCliente()` exige
  `clientes/<este cliente>/` sin `..`, y se comprueba que existan al pedir (no a la mitad).
  · **El costo es una estimación y se rotula así** (`estimado` en el catálogo, «precio
  aproximado» en la pantalla). Un modelo con tarifa por tokens conocida (`PRECIOS_GEMINI`)
  cuenta tokens; el resto, el precio del catálogo. Desde `CONFIRMAR_DESDE` (0,50 $) el
  SERVIDOR exige `confirmado: true` (409 `confirmar`), no sólo la pantalla: un asistente o
  Claude por MCP tampoco se salta el segundo toque (una IMAGEN con el modelo del cliente dentro del tope de «crear sin
  preguntar», si el espacio lo fijó, no lo pide: ver «La confirmación de 0,50 $ se puede fijar»). Con el presupuesto
  agotado y «detener» se rechaza antes de crear, y otra vez antes de cada imagen.
  · **`/api/generar-imagen` sigue con su contrato** (`{ clave, mimeType }`) pero llama a la
  misma `llamarGemini()` y apunta la imagen en la galería (`origen: "app"`). De esas la
  papelera quita la FILA y nunca el objeto de R2: lo puede estar usando una publicación
  sin que el Estudio lo sepa. Sólo se borra de R2 lo que el Estudio creó o lo que se subió.
  Lo que una publicación usa (`usado_en`, `POST …/uso`) no se purga.
  · **Un id de modelo de Google es una apuesta sobre la cuenta.** El único que ya usa la
  aplicación es `gemini-2.5-flash-image` (Nano Banana); los demás salen de la documentación
  de Google y un 404 dice «tu cuenta no tiene el modelo …» en vez de un error genérico.
  · **Los eventos del Estudio los emite `trabajos.js` y `rutas/estudio.js`,** que el test de
  tiempo real lee sólo por sus llamadas a `difundir()`: sus columnas también se llaman `tipo`.
  · **Hay dos formas de motor y las dos las escribe cada proveedor** (contrato en `motores.js`):
  IMAGEN que contesta en el acto (`generar`) y COLA (`enviar` + `sondear`). Van por la cola todo
  video y las imágenes de Higgsfield (`enCola(modelo)`, no `tipo === "video"`: se rompió al meter
  Higgsfield). **Enviar es lo único que no se repite:** el id del motor se guarda antes que nada, y
  con él sus direcciones de seguimiento (`datos`). Un video se cobra al ENTREGARLO, por segundo.
  · **Un video sin ajuste de duración cuesta 0 si nadie lo cubre:** `por: "s"` × 0 s no pide
  confirmar. Lo evitan `segundos` (duración fija) y un test que recorre todo el catálogo.
  · **Las direcciones que devuelve un proveedor no se creen.** `status_url` de fal y de Higgsfield
  reciben la llave, así que sólo se siguen si son de SU origen (`esDeLaCola`, `esDeHiggsfield`);
  si no, se reconstruye la de la documentación. El archivo del resultado se baja SIN la llave.
  · **Higgsfield sale de su esquema, no de la memoria.** `higgsfield-schemas.json` dice, por ruta,
  qué campos hay, qué valores admite y cuáles son obligatorios; de ahí salen el catálogo
  (`scripts/estudio/generar-higgsfield.mjs` → `estudioHiggsfield.json`, que un test regenera y
  compara), la ruta de cada pedido (según las imágenes que lleve) y el cuerpo (sólo campos de esa
  ruta, cada valor uno que acepta). Sólo entran los modelos que se pueden pedir SIN subir un video.
  Cuando Higgsfield cambie su documentación: bajar el nuevo `llms-full.txt`, regenerar el
  esquema como hizo Agents Office (`scripts/higgsfield-schemas.mjs`), copiar el JSON y correr el
  generador. **Nada de fal.ai ni de Higgsfield se ha probado contra el servicio real**: los tests
  usan un `fetch` de mentira que habla como ellos. Lo primero con una llave es un pedido barato
  (Z-Image Turbo, Flux Schnell) y luego uno de video corto.
  · **Kie.ai es un cuarto proveedor, todo por COLA** (`worker/lib/estudio/kie.js`, `KIE_API_KEY`; su documentación, la
  parte que se usa, en `docs/kie/`). Imagen: GPT Image 2 y 2.5, Nano Banana Pro, 2 y 2.1, Ideogram 3, Seedream 5 Pro,
  Imagen 4 Ultra. Video: Gemini Omni Flash (el de Flow: hasta 7 referencias —fotogramas del storyboard, personajes—,
  o imagen inicial y final, o un video para corregir un tramo), Kling 3.0 y 3.0 Omni, Seedance 2.0 y 2.5, Veo 3.1 Fast
  y Quality (también por `createTask`, con `model: "veo-3-1"` y el nivel en `input.model`), Hailuo 2.3 y Wan 2.7. «Pulir
  el acabado» (Topaz, Recraft) se QUITÓ: la agencia no le encontró uso. Sus ids viven en `MODELOS_RETIRADOS` para que
  lo ya pulido siga teniendo nombre.
  Kie contesta casi siempre HTTP 200 y pone el error en `code` (401 llave, 402 créditos, 422 datos, 429/455/5xx
  pasajeros): `datosDe` mira el `code`, no sólo el estado. `resultJson` llega como TEXTO JSON (`urlsDelResultado`).
  Las imágenes y el video de apoyo se suben a su almacén (`file-stream-upload`, `images/estudio` o `videos/estudio`,
  caducan solas) y van por dirección, cada papel en su campo (`refs`, `inicio`, `fin`, `videos`); el resultado se baja
  SIN la llave. Lo que un modelo no mezcla (Omni y Kling Omni: imagen inicial con referencias o video; Veo: referencias
  con imagen inicial) lo rechaza `validarKie` AL PEDIR. El precio depende de la calidad: `costoSegun` en el catálogo
  (`costoUnitario`). GPT Image no tiene 4:5 (sale 3:4 y se adapta al programar). Un test exige que cada modelo de Kie
  del catálogo tenga su pedido en `MODELOS_KIE`, y al revés. **Nada de Kie se ha probado contra el servicio real**: la
  forma sale de su documentación.
  · **La documentación de octubre de 2026 sumó ~35 modelos** (`docs/kie/catalogo-2026-10.md`, el extracto de la agencia:
  por cada `model`, sus campos, los obligatorios con `*` y los valores de cada lista). Imagen: Imagen 4 y Fast, Nano Banana
  2 Lite, Z-Image, Seedream 4.5 y 5 Lite/Flash, Flux 2 Pro/Flex y 3 Klein, Grok Imagine 2, GPT Image 1.5 y 2.5 Flare, Qwen
  2.1 y 3 Pro, Wan 2.7 Image (y Pro) e Ideogram con personaje. Video: Gemini Omni con video, Seedance 2 Fast y Mini, Kling
  3 Turbo y 2.6 (también «copiar el movimiento»: una foto + un video), Veo 3.1 Lite, Wan 3 y Prime, Hailuo 2.3 Standard,
  MiniMax H3, PixVerse 6 (con inicio y final hace la transición), HappyHorse 1.1, Grok Imagine Video y Vidu Q4. Fuera, a
  propósito: lo que exige `callBackUrl`, lo que parte de un `task_id` (extender, ampliar, 4K), máscaras, avatares y labios,
  y las API con su propio endpoint (4o, Flux Kontext, Runway). **Los precios no vienen en la documentación**: todos son
  estimados y lo dicen. `tests/migracion/kie.modelos.test.js` LEE el extracto y comprueba cada forma de pedir cada modelo
  (texto, referencias, inicial, inicial y final, video): `model` que existe, sólo sus campos, todos los obligatorios y los
  valores de las listas. Cazó uno de antes: Seedance 2.0 y Fast recibían `output_format`, que sólo admite 2.5. Si Kie
  cambia su documentación, se reemplaza el extracto y el test dice qué pedido dejó de cuadrar.
  · **El VIDEO de referencia es un cuarto papel de los medios** (`medios.video`, junto a start/end/reference). Sólo
  lo admiten los modelos de Higgsfield marcados `conVideo` en el generador (Kling Omni · sigue un video, Kling 3.0
  · copia el movimiento): `video: 1` y `necesitaVideo` salen del esquema. Va a SU almacén como las imágenes, desde
  R2 y con tope de 50 MB (el Worker lo tiene en memoria al subirlo).
  · **Las imágenes de apoyo de fal van como data URI y las de Higgsfield a su almacén**
  (`/files/generate-upload-url` + PUT, sin la llave). Los formatos de fal por `image_size` son
  sólo los exactos (`FORMATOS_FAL`): con «4:5» la imagen saldría 3:4 aunque la pantalla dijera 4:5.
  · **El asistente y Claude (MCP) piden por la MISMA puerta** (`estudio/herramientas.js`): la
  confirmación de 0,50 $ no la da la herramienta (`confirmado` sólo vale si es el booleano `true`,
  y la descripción le dice al modelo que no lo ponga por su cuenta), topes más cortos que los de
  la pantalla, imágenes de apoyo por id de la GALERÍA de ese cliente (nunca una clave de R2), y un
  ejecutor sin `estudio` no puede gastar. La guía visual de la marca sale del cerebro con
  `para: "imagen"` (sin notas internas) y se le ENSEÑA al modelo; no se pega al prompt, porque
  lo que sale al proveedor tiene que ser lo que quedó escrito en la galería.
  · **`ver_estudio` da el CATÁLOGO con los IDs de la galería de las fotos de cada producto y del logo** (`textoDelCatalogo`):
  sólo enseñaba las 12 piezas más nuevas, y las fotos reales de un producto, subidas hace semanas, no salían nunca —Claude
  pedía el video sin ellas y el modelo se inventaba la caja—. Lee `mercado_clientes` a mano, no con `leerMercado`
  (mercado.js importa este archivo por herramientasServidor.js: sería circular). El logo se da con su regla: en video, una
  imagen de cierre con el logo como `imagen_final`, nunca de referencia.
  · **Claude VE lo que crea** (`worker/lib/estudio/miniaturas.js`): `estado_trabajo`, ya terminado, devuelve las imágenes y
  `ver_pieza` enseña hasta 6 piezas de la galería de ESE cliente con su modelo, su pedido y el resultado del control (las dos
  van como `{ texto, imagenes }`, que el MCP y el asistente ya pasan como bloques de imagen). Va una COPIA de 768 px en JPEG
  que hace el Container (`POST /miniatura`, sin guion): una pieza de 2K en PNG pesa de 4 a 8 MB. Sin Container (en local)
  o si falla, la original sólo si pesa menos de 1,2 MB; si no, el texto lo dice y no falla. Antes, por MCP, Claude creaba
  a ciegas: recibía «Listo» y no podía corregir nada.
  · **Lo creado desde «Subir» apunta su uso al guardar** (`delEstudio` en `SubirRapido`): la
  publicación aún no existe al crear, y sin `usado_en` la papelera podría llevarse el archivo.
- **El lote sigue en el SERVIDOR aunque se cierre la aplicación** (decisión de la agencia: en el teléfono, salir de la
  app paraba lo que se estaba creando; `worker/lib/estudio/encargos.js`, `bomba.js`, 0049; `src/lib/loteServidor.js`).
  Antes el lote lo orquestaba la pestaña con `await`: lo pedido terminaba por el cron, lo demás no se pedía nunca.
  · **Un ENCARGO es la cadena entera como lista de pasos con su avance** (`estudio_encargos`). La pantalla arma cada
  pieza por el MISMO camino de siempre (`pedidoDeLote`) con «{{ESCENA}}» en el hueco (`pasoDeLote`; un test exige que,
  quitado el hueco, el pedido sea idéntico) y el servidor la lleva: el director pieza a pieza (ver «El director piensa CADA pieza»; las vistas de las plantillas y
  los «Me gusta» viajan con el encargo y se borran al terminar el director), la mejora si no hay ficha, el trabajo, la
  proporción (se recompone con el mismo modelo y si no con el relevo, como `esperarArchivos`), el control y UNA
  corrección que se queda sólo si mejoró (`mejoro`, contra la ficha de la ORIGINAL). De dos en dos (`paralelo`).
  · **Quién avanza**: la BOMBA, la alarma del Durable Object del espacio (`hub.js` → `bombear`). `crearTrabajo` y
  `crearEncargo` la despiertan (`despertar`, ESPERADO: sin `await` la petición al objeto podía cortarse). Cada alarma es
  su propia invocación (sus 50 consultas y 50 peticiones): da 3 pasos caros y vuelve en 1,5 s, o cuando toque el video.
  Con eso también un trabajo SUELTO (el compositor, «Crear la imagen aquí») sigue en segundos sin pantalla; antes, uno por
  minuto. El cron sigue de respaldo (`avanzarPendientes`, `encargosDelCron`) y despierta a la bomba si la ve dormida. La
  pantalla sólo LEE cada 3 s y empuja (`/avanzar`) si lleva 20 s quieto: si diera ella los pasos, salir a mitad de una
  llamada a la IA la tiraría (y se pagaría igual).
  · **El permiso** es `bloqueado_hasta` (4 min: el director con razonamiento tarda), reservado con el valor leído como
  condición, como en los trabajos. Los `finales` que pone la pantalla también lo toman (si no, un paso a la vez se
  llevaría lo escrito): ocupado → 409 y la pantalla reintenta.
  · **Lo que necesita lienzo lo hace el CONTAINER** (`acabarPieza` en worker/lib/estudio/acabado.js → POST /acabado, con el
  MISMO dibujo de src/lib/acabadoLienzo.js que la pantalla): el texto de la plantilla y el logo estampado, una pieza por
  paso, subida como la sube la pantalla (`origenId`, su `plantilla`). Un paso así (`porAcabar`) no deja cerrar el encargo
  hasta intentarlo; si no hay Container (en local) o falla, queda `acabadoIntentado` y lo pone la pantalla al volver
  (`terminarPaso`, `finales`), como antes. Con alguna opción terminada, las otras quedan en su cruda (si no, la pantalla
  pondría el texto otra vez). Un encargo cerrado por plazo no espera al Container.
  · **La plantilla que escoge el director** (o la de su tipo) se suma al pedido EN EL SERVIDOR (`conPlantillaDelDirector`
  en encargos.js): su imagen detrás de las que ya iban, con su línea numerada y su sistema escrito, como `pedidoDeLote` en
  la pantalla. Si ya llevaba una, si no cabe en el modelo o si la plantilla ya no está, el pedido no cambia.
  · **Lo que NO hace el servidor**: los REELS (guion, fotogramas, video) y los planes del director en el chat.
  · **El carrusel también es un encargo** (`tipo: "carrusel"`): «Carrusel con IA» (FlujoCarrusel), los carruseles del
  lote y los de «Producir el mes». Va en ORDEN (`paralelo` 1): cada lámina con la anterior y la portada (las CRUDAS) de
  referencia, armada por `armarLamina` (src/lib/laminaPedido.js), el MISMO pedido que `crearLamina` en la pantalla; el
  sistema de la portada se saca UNA vez antes de la segunda (no en plantilla) y va en su pedido y su control. Con
  `propuesta`, el director diseña la serie en el servidor antes de la primera lámina (las `laminas` del guion quedan de
  respaldo). «Primero la portada» son dos encargos: el segundo lleva `previas` (claves de la portada y la anterior) y el
  `sistema`. Al terminar, la carpeta del carrusel queda ORDENADA (la galería lo enseña como una tarjeta).
  · **Lo que necesita lienzo va en `navegador` de cada paso** ({ plantilla: { texto, plantilla }, logo }); sin nada, el
  servidor pone `finales` = lo que salió. Lo pone la pantalla que sigue el encargo y, si nadie lo miraba, la aplicación a
  los 20 s de abrirse (`terminarPendientes`, sólo los encargos de quien los pidió: si no, cada pestaña del equipo pondría el
  mismo texto) desde `/api/encargos/por-terminar` (los de 7 días con piezas sin `finales`). `enCurso` evita hacerlo dos
  veces en la misma pestaña.
  · **«Diseñar las que ya hay»** (ProducirMes) lanza un lote con las imágenes (pedido con `calendarId`/`postId`, la ficha
  lista si la hay, el director si no) y un carrusel por publicación; apunta los encargos en el navegador
  (`producir-mes:<calendario>`, 3 días) y al reabrir enseña lo que salió para ponerlo (`resultadosDeProduccion`,
  lib/produccion.js). Las fichas nuevas del director (`deDirector`) se guardan en su publicación una vez.
  · **Volver**: el borrador del lote guarda los encargos; «Seguir con ellas» abre el paso 3 con lo que salió y sigue lo que
  falte. Cerrar el diálogo ya no se impide por lo que va en el servidor («Cerrar (sigue en el servidor)»), y «Detener»
  lo cancela (lo que ya estaba saliendo se queda en la galería).
  · **Nada de esto se ha probado contra Cloudflare real**: los tests llaman a `bombear` como lo haría la alarma.
- **El kit de marca del Estudio: lo que la agencia hacía en Flow con un texto
  por marca, por cliente y SALIDO DEL CEREBRO** (`clients.kit_marca`, 0033;
  lo puro en `src/lib/kitMarca.js`, lo que toca base/R2/IA en
  `worker/lib/estudio/kit.js`).
  · **«Preparar con IA» PROPONE, no guarda.** Lee el cerebro con `para:
  "imagen"` (nunca lo interno) más la ficha, y la IA escribe paleta (sólo
  colores que aparezcan, con su papel), tipografía, estilo, luz, «nunca» y
  un preset por tipo de contenido (los de Baby Caleb y ROFER van como EJEMPLO
  del tono, no se copian). Una persona lo revisa y guarda; «Corregir antes»
  abre el formulario. Los presets PROPIOS (hasta 6) no los toca la IA.
  · **La marca va en TODA pieza, no dentro del preset** (`bloqueDeMarca`: paleta,
  estilo, luz, tipografía, «nunca»), SIEMPRE que el kit tenga algo (la casilla «Usar el kit
  en esta pieza» se quitó: cambiaba el resultado por navegador). Antes sólo viajaba dentro del preset: con «Sin
  preset» —lo que salía desde un post sin tipo— la imagen no sabía nada de la
  marca, el logo tampoco iba, y «Revisar marca» daba 4 de 10.
  · **Un preset por TIPO DE CONTENIDO** (`TIPOS_PRESET`, mismos ids que
  `PILARES`; las 7 maletas también como `maletas-garantia`… que suman su línea):
  qué clase de pieza es, SIN la paleta. Desde un post sale de su tipo
  (`presetDePilar(pilar, sub)`); sin tipo, ninguno, y lo recordado de la pestaña
  NO se hereda ni se pisa. Los de antes se traducen al leer (`limpiarKit`,
  `presetActual`): producto → servicios; corporativo y creativo → propios.
  · **El pedido:** `componerPedido()` = preset + acabado + «Escena: idea» + bloque
  de marca + la línea del logo (si va) + el movimiento en video;
  `pedidoConMarca()` lo arma con el kit para la pantalla, «Producir el mes» y el
  asistente, y `estiloDeMarca()` (preset + marca en un texto) para el carrusel.
  Lo que sale al motor es lo que queda en la galería; `ideaDelPedido()` recupera
  la escena (empiece o no por ella) para «Pedirla corregida» y para la tarjeta.
  · **El logo va de referencia sólo en imágenes** (`ponerLogo()`): en un video
  la imagen de apoyo es el primer fotograma y el video empezaría en el logo.
  Tiene que ser PNG/JPG/WEBP de ESE cliente (lo comprueba el servidor: un SVG
  no le sirve a ningún motor). `clientToRow` NO lleva `kit_marca`: sólo lo
  escribe el Estudio, así una ficha abierta desde antes no lo pisa.
  · **«Revisar marca» MIRA la imagen** (va como bloque de imagen, ≤ 3,5 MB) con
  el kit delante y devuelve puntaje, qué cumple, qué falla y una sugerencia.
  Funciones «kit de marca» y «revisión de marca» en el hueco «análisis».
  · **El asistente y Claude (MCP) usan el mismo kit:** `crear_en_estudio` pone
  la marca y el logo siempre que haya kit (con `estilo`, además el preset de ese
  tipo); `ver_estudio` dice si el kit está preparado.
- **Una referencia sin más hace que el modelo copie de más** (`src/lib/referencias.js`). Cada imagen de referencia
  dice QUÉ se toma de ella («¿Qué tomo de aquí?»: estilo, composición, producto, persona, fondo, tipografía o todo) y
  un comentario; el pedido lo dice imagen por imagen, numeradas EN EL ORDEN en que se mandan (por eso las líneas van
  en `componerPedido({ referencias })`, detrás de la escena, y el logo del kit va el último con su propia línea).
  `toma` y `nota` viajan en el mismo archivo puesto en `form.medios.reference`; al servidor sólo llega la clave.
  · **Las fotos del catálogo son el producto REAL**, no una referencia de estilo: llevan `producto` (`fotosDelProducto`)
  y su línea dice «cópialo tal cual». Si el producto es de OTRA marca (`marca` en el catálogo: lo revenden), se respeta
  su empaque y no se le pone el logo del cliente. «Producir el mes» manda las mismas líneas.
  · **Si la idea nombra un producto del catálogo con fotos, sus fotos se suman al crear** (`productoNombrado`, sin
  tildes, gana el nombre más largo) y el compositor lo dice ANTES de pedir. Sólo si caben en el modelo.
- **«Otra igual» y «Otra versión distinta» salen ya, sin pasar por el compositor** (visor de la galería). «Otra igual»
  repite el pedido de la pieza con las imágenes de SU trabajo. «Versión distinta» pide a la IA 1–3 escenas nuevas con la
  misma información (`POST /api/estudio/<c>/versiones`, función «prompt de imagen», texto) y `conOtraEscena()` cambia
  SÓLO la escena del pedido: tipo, acabado, referencias, marca y logo se quedan. El costo se enseña en el botón (es la
  confirmación). En la imagen de una publicación (pestaña Subir), «Otra versión» se HACE AHÍ (`src/lib/otraVersion.js`)
  y ocupa el sitio de la anterior, con «Deshacer»: si la imagen salió del Estudio, su pedido con otra escena; si no
  (subida, Drive), el camino de UNA pieza sobre la idea y el texto de la publicación, SIN la imagen vieja de referencia
  (la copiaría). Es para reutilizar un post con otro diseño; «Duplicar a otro día» (`copiaDePublicacion`, lib/subir.js:
  pendiente, sin la aprobación, la etapa ni la copia de Drive de la original) es el otro medio. «Recrear con mi marca»
  hace lo mismo con una REFERENCIA subida al post (imagen: va primera con `TOMA_DE_OTRA_MARCA`; video: como video de
  referencia, con Kling Omni u otro que lo admita). En «Subir», sin publicación todavía, sigue abriendo «Crear con IA».
- **«Me gusta» (la estrella de antes, `favorito`) y la papelera enseñan al kit** (`src/lib/aprendizajeVisual.js`,
  `worker/lib/estudio/aprender.js`, `POST /api/estudio/<c>/kit/aprender`, en Cerebro → Lo que aprende → «Lo visual»).
  La IA MIRA las imágenes (hasta 8 que gustan y 4 descartadas, función «aprendizaje visual») y PROPONE reglas; nada
  se guarda hasta que una persona pulsa «Añadir al kit», que hace PUT del kit entero con `aprendido`. Las guardas las
  pone el código: dos imágenes de respaldo y al menos una que guste, números que existan, nada que el kit ya diga; lo
  subido a mano no cuenta como descartado (no lo hizo el motor). `kit.aprendido` va en `bloqueDeMarca` —toda pieza— y
  en la revisión de marca, y `fundirKit` lo conserva al volver a preparar el kit con IA: si no, «Volver a preparar» se
  llevaría lo aprendido sin avisar. «Usar mis Me gusta como referencia de estilo» (por cliente, apagado) suma las dos
  últimas que gustan con `toma: ["estilo"]`, en el hueco que dejan el producto y el logo.
- **La PRODUCCIÓN EN LOTE es la versión propia de la agencia de una matriz de producción de anuncios, para TODOS los
  tipos de pieza** (`src/lib/loteAnuncios.js`, `worker/lib/estudio/lote.js`, `EstudioLote.jsx`; inspirada en el método
  de las skills de Felipe Vergara, escrita con palabras propias: su licencia prohíbe copiar o exportar el contenido de
  sus skills, así que nada de ese texto entra al repositorio). Cuatro formas de llenar las casillas, el mismo camino:
  · `celdasMatriz` (anuncios): los 3 DESEOS × los 2 PERFILES del estudio de mercado APROBADO × los niveles marcados,
  hasta 30, en orden de embudo; el servidor sólo acepta deseos y perfiles que estén en el estudio. Sin estudio, por
  niveles (`celdasPorNiveles`). `celdasPorTipos` (cuántas de cada tipo) y el mes (`loteMes.js`) pasan por
  `asignarMatriz`: producto, nivel, deseo, perfil y la maleta que toca, como «Planificar mes».
  · **La forma la decide el CÓDIGO** (`darForma`): lo que no se da resuelto el modelo lo resuelve IGUAL cada vez, y
  salían veinte piezas que sólo cambiaban de foto y de texto. Composición (12, `COMPOSICIONES`; las de `objeto` sólo
  con el producto en cuadro: una «macro de textura» sin objeto se rellena con cualquier cosa), fondo, TÁCTICA del
  gancho (`TACTICAS`; precio, prueba y urgencia sólo con datos reales) y producto (rotan los del plan, primero los que
  tienen fotos). Dos vecinas nunca repiten composición.
  · **El producto SE VE sólo de «consciente de la solución» en adelante** (`seVeElProducto`, `conProducto`): en los
  niveles fríos y en los tipos sin producto no van sus fotos y la escena lo dice; con un producto escogido, la pieza
  fría sabe de qué producto es el problema aunque no salga.
  · La IA escribe por casilla título, BRIEF (qué comunica), titular (40 caracteres y 8 palabras; `limpiarTitular`
  quita el «·», que los motores dibujan como «¿»), apoyo, escena y descripción, sin reseñas, cifras ni urgencias
  inventadas y sin marcas en lo que no es el producto real. `titularesUsados()` le dice lo que ya salió.
  · **Aprende qué composiciones funcionan con cada cliente** (`aprenderComposiciones`): «Me gusta» +2, usada en una
  publicación +1, papelera −1 (lo subido a mano no cuenta), reconocidas por su línea en el pedido — por eso la línea de
  la composición NO pasa por «Mejorar idea». Con 6 señales o más, las que restan no salen y las que suman se
  intercalan (una de cada dos piezas).
  · Al crear (`crearPieza`, loteEstudio.js): la escena se MEJORA sola (apagable), se piden 1–3 imágenes por idea en un
  solo trabajo, se escoge una y la publicación llega al calendario con título, brief (`idea`), texto de la pieza,
  descripción, tipo y matriz, PENDIENTE: lista para revisión.
- **Toda lista de modelos va del más barato al más caro** (`porPrecio`, `costoDePieza` en estudioCatalogo.js; el
  compositor arranca en «Más barato»): se compara lo que cuesta UNA pieza —un video, con su duración por defecto—,
  no el precio por segundo contra el de una imagen; los que no tienen llave y la prueba, al final. El PREDETERMINADO
  no es el primero de la lista: el carrusel y los fotogramas arrancan en `modeloParaCarrusel`, el video del reel en
  `modeloRecomendadoParaReel` (Omni por Kie, el que admite storyboard).
- **Una imagen de la galería no va siempre al primer sitio libre** (`ranurasLibres` en lib/estudio.js): en video
  ese sitio era la imagen inicial y una referencia nunca llegaba a referencias. Con más de un sitio libre se pregunta
  (`EleccionRanura.jsx`), y cada sitio del compositor tiene «De la galería»: la siguiente imagen que se toque va ahí.
- **El modelo se fija POR CLIENTE** (`kit.modelos`, «Fijar … para este cliente» en el compositor; el servidor sólo guarda
  un id del catálogo de ese tipo): lo comparte el equipo y arranca el compositor, la producción en lote y «Producir el
  mes» (`modeloPreferido(activos, tipo, kit.modelos[tipo])`). Sin llave o retirado, el predeterminado.
- **La pieza compuesta (texto de plantilla encima) RECUERDA su cruda** (`origenId` + `plantilla` al subir; el Worker
  copia prompt, modelo y trabajo de la cruda si es de ESE cliente, `herenciaDe` en galeria.js). Sin eso salía «Subida»
  y «Otra versión» no existía para ella. La nueva versión sale cruda y el navegador le pone el MISMO texto en el mismo
  sitio (`conTextoEncima`). Ojo: comparte `trabajo_id` con la cruda; `esperarArchivo` busca la que NO lleva `plantilla`.
- **La ESCENA va primero en el pedido y el tipo de pieza detrás** (`componerPedido`, `PREFIJO_TIPO`). Antes el tipo
  era un párrafo DELANTE que fijaba la composición («el producto al centro, espacio para el titular y el botón»): el
  motor le hacía caso a eso y no a la idea, y las piezas de «Sin tipo» salían mejor. Las bases (`TIPOS_PRESET.base`)
  dicen para qué es la pieza y el tono, no cómo se encuadra, y lo mismo se le pide a la IA del kit. Cada tipo (y
  cada propio) puede llevar hasta dos imágenes de la galería como referencia visual (`kit.referencias`,
  `referenciasDePreset`; sólo claves de ESE cliente y sólo las que siguen en la galería: una borrada rompería el
  pedido). En el lote van sólo por su estilo: la composición la decide el plan.
- **UNA pieza, un solo camino** (`src/lib/pieza.js`): el compositor, el lote, el mes completo y «Producir el mes» arman
  cada pieza con `apoyosDePieza` (fotos REALES del producto, lo puesto a mano, referencias del tipo y del estilo
  propio, «Me gusta»; dejando sitio al logo) y `pedidoDePieza` (escena + tipo + estilo con su acabado + referencias +
  marca + logo, en 2K si el modelo lo tiene; a mano la resolución la escoge la persona). El lote salía peor que la
  pieza a mano por tres cosas que ya no existen: escribía la escena, la mejora no veía el TEXTO y después pegaba
  frases fijas iguales para todo el lote («Composición: …», «Fondo de color pleno…»). Ahora la mejora recibe
  `ideaParaMejorar` (escena, composición SUGERIDA, texto exacto y el brief como contexto) y detrás de la escena sólo
  va «Composición: <nombre>.» (así `aprenderComposiciones` la reconoce) y, con plantilla, la zona libre. El texto lo
  escribe el motor por defecto. «Producir el mes» también mejora cada idea (como «Crear con IA» desde una
  publicación). Un test exige que la misma idea dé el mismo pedido por el lote y a mano.
- **Tipo de pieza (QUÉ comunica) y estilo visual (CÓMO se ve) son dos cosas** (`ESTILOS_VISUALES` en kitMarca.js). En
  el compositor el tipo va ANTES de la idea (cambia «Dame ideas» —de ese tipo, salvo «Variadas»— y «Mejorar idea»,
  que recibe `pieza` como propósito) y el estilo va después, con el kit y las referencias. Cada estilo lleva UNA
  línea de acabado profesional (luz, lente, color, tipografía): párrafos largos empeoran el resultado. El estilo de
  una pieza es el escogido, o el que el cliente fijó para ese tipo (`kit.estiloPorTipo`), o el de la casa
  (`ESTILO_POR_TIPO`): `estiloDeLaPieza`. `pedidoConMarca` lo aplica SOLO, así el lote, «Producir el mes» y el
  asistente piden con acabado sin cambiar nada. Corporativo y Creativo eran presets propios que describían un
  aspecto: `limpiarKit` los pasa a ESTILOS propios (`kit.estilos`, ids `estilo-…`) con sus referencias. Las líneas
  visuales de las 7 maletas son «composición sugerida (si la escena no dice otra)». El `acabado` de antes (mismos
  ids) se sigue aceptando.
- **«Mejorar idea» se lanza SOLA al abrir «Crear con IA» desde una publicación** (siempre: la casilla que la apagaba
  por navegador se quitó; con «¿Qué quieres?» escrito, el director rediseña aunque haya pedido listo): la idea + el texto de la pieza + el contexto llegan juntos y largos; en una imagen la reescribe el
  director de arte como FICHA DE DISEÑO (ver «Mejorar idea ya NO resume», más abajo). El texto entre comillas se conserva EXACTO (lo dice el pedido de la mejora). «Volver a mi idea».
  **Salvo que el post ya traiga su pedido LISTO** (`src/lib/promptImagen.js`): el motor de ideas (lote, «Planificar
  mes», «Completar los textos», «Generar», «Otra») escribe por cada pieza de una imagen el campo `imagen` —la escena
  con su composición y el titular y el apoyo EXACTOS entre comillas, el estilo de la mejora— y `leerProduccion` sólo
  lo acepta si trae el titular y el apoyo tal cual (si los reescribió, el motor escribiría otra cosa). Se guarda en
  `promptImagen` con `promptImagenDe`, la huella de qué se ve (o la idea), el texto de la pieza y el formato: si alguien
  cambia cualquiera, deja de valer y se vuelve a la mejora. `rellenarConIdea` sólo lo pone si la publicación queda
  diciendo lo de la IA (qué se ve escrito por una persona no lo recibe). Una mejora hecha al abrir se GUARDA en el post
  (`onMejorada`): la segunda vez sale lista. Bajo «Qué se ve», «Lista para crear la imagen».
- **«Crear la imagen aquí», «Corregir esta» y «¿Qué quieres?» en la pestaña Subir** (`crearImagenDelPost` en
  lib/otraVersion.js; seccionPublicar.jsx). Un post o una historia SIN archivos se crea ahí, sin abrir el Estudio: el
  pedido listo (o la publicación mejorada una vez, que se queda en el post), el modelo fijado del cliente, su kit, las
  fotos de su producto, su tipo, el control y el logo; confirma desde 0,50 $ como «Otra versión» (salvo dentro del tope de
  «crear sin preguntar») y «Deshacer» la quita.
  «Crear con IA» sigue para revisarlo antes. «¿Qué quieres?» (opcional, no se guarda) lo suman «Crear la imagen aquí»,
  «Otra versión» y «Recrear con mi marca» (`lineaDeIndicacion`: también a la IA que escribe la escena nueva);
  «Corregir esta» lo NECESITA y EDITA la misma imagen (`rehacerConComentario`, como «Rehacer con lo que pidió el
  cliente») en su sitio. Se vacía al salir bien. CalendarView importa el motor de ideas EN DIFERIDO (al pulsar
  «Completar los textos»): con la huella dentro, la carga inicial pasaba de 180 kB.
- **«Otra versión», «Corregir esta» y «Recrear con mi marca» de una imagen del post se hacen EN EL POST, por el director
  y el servidor** (decisión de la agencia del 5 de noviembre: fuera el interruptor «En el Estudio / Aquí, rápido», que se
  recordaba por navegador como `post-acciones-donde`). Lo «a ciegas» de antes ya no lo es: el director MIRA la original
  (papel «original») y la pieza sale revisada (lib/piezaServidor.js); ocupa su sitio con «Deshacer». Al lado de cada
  imagen, «Ver en el Estudio» (`verEnEstudio` en seccionPublicar) pasa la imagen por `archivoEnGaleria` (lib/estudio.js:
  la ficha que ya había por ruta o clave; si se subió directo al post o vino de Drive, la SUBE —la huella evita la copia
  doble—) y abre el visor con `inicial.abrir` (`accion: "ver"`): sus versiones, «Editar» con ejemplos de la galería; lo
  escogido va al SITIO de la imagen tocada (`onReemplazar` de `useCrearConIA`; el botón dice «Poner en la lámina N»). Con
  `inicial.abrir` el diálogo NO lanza «Mejorar idea» (`listo`): se viene a corregir, no a crear. «Animar» se quitó del post.
- **La papelera no borra lo que usa la MARCA** (`clavesDeLaMarca`, `sinClavesPerdidas` en kitMarca.js; `clavesPerdidas` en
  worker/lib/estudio/galeria.js). El logo, la muestra de la tipografía, los personajes, las plantillas, las referencias
  de cada tipo y las fotos del catálogo son archivos de la galería sin `usado_en`: vaciar la papelera (o la purga de 30
  días) los borraba de R2, el kit y el catálogo seguían apuntando a ellos y TODA pieza que los llevaba de referencia
  fallaba con «Una de las imágenes ya no existe» (un carrusel entero del director, lámina a lámina). Ahora la purga y
  «Vaciar» los saltan y «Borrar del todo» contesta 409 diciendo qué es. Lo que una papelera de antes ya borró: GET
  /api/estudio lo quita del kit y de `productos` que devuelve (sin tocar lo guardado; se comprueba en R2 sólo lo que no
  tiene ficha, como mucho 10) y lo dice en `perdidas`, que el kit enseña arriba. `crear_en_estudio` salta un logo
  perdido. Y si aun así llega una referencia perdida que es de la MARCA (`sinLaQueFalta` en trabajos.js: al pedir y
  otra vez al generar, porque los encargos del servidor guardan sus claves y `conPlantillaDelDirector` lee el kit
  GUARDADO), la pieza se crea SIN ella y la nota dice cuál faltó y dónde se arregla (`medios.faltaron`); antes una
  sola tumbaba el carrusel entero. Una que no es de la marca (la imagen que se corrige, la lámina anterior, lo puesto
  a mano) sigue cortando: sin ella sería otro pedido.
- **El modelo se escoge para UNA acción, sin fijarlo** (`SelectorModelo.jsx`; `modeloEscogido` en otraVersion.js,
  `modeloDeEdicion` en edicion.js): en el visor («Editar», «Otra igual», «Otra versión distinta») y en el post
  («Crear la imagen aquí» y las acciones rápidas; ya no está en `OpcionesCrearAqui`). Los que no hacen la proporción
  que tiene que salir se marcan con el que los releva (`relevoDe`): antes se cambiaban en silencio y la galería se
  llenaba de Nano Banana sin que nadie lo escogiera. Lo que sale dice con qué se hizo. La galería filtra por modelo
  (`modelosDeLaGaleria`, por NOMBRE) y el buscador encuentra por él. **Lo de `/api/generar-imagen` se apunta con el id
  del PROVEEDOR** («gemini-2.5-flash-image», «muse-image-1.0»): `nombreDelModelo` lo resuelve por `gid`, o la tarjeta
  decía «gemini-2.5-flash-image».
- **El lote del MES completo** (Producir en lote → «Mes completo», `POST /api/estudio/<c>/lote/mes`): el mes y los días
  de la semana; cada día toma su tipo del RITMO del cliente con los ajustes de temporada (`sugerenciasDeTemporada`,
  aplicados solos: son conservadores) y la matriz de «Planificar mes» (`asignarMatriz`). Las piezas van al calendario
  cada una en su día, una tras otra (`llevarAlCalendario`: el mismo calendario no se escribe a la vez). Del mes en
  curso, sólo desde hoy (Panamá).
- **El lote va por FASES y por FORMATOS** (`EstudioLote.jsx`). Las ideas se escriben de `TANDA` (6) en 6 con `{ desde,
  tamano }` (el servidor corta el plan a `TANDA_MAX`, 10, y devuelve `total`): el plan es el MISMO en cada tanda porque
  sale de la misma semilla, y cada tanda recibe los titulares que ya salieron. Con 30 en una llamada cada pieza recibía
  muy poca atención. Fase 1: «Sólo las ideas al calendario» las lleva SIN diseñar, cada una en su día, sin archivos (el
  cliente aprueba la idea mientras no tengan pieza; ya SIN marca `aprobacion`: ver «La marca «idea» del sistema se iba
  con la publicación») y con «Qué se ve» (`post.escena`), que es lo primero que leen después «Crear con IA» y «Producir el
  mes» (`promptDePublicacion`). Fase 2: crear las que no se llevaron. Formatos `carrusel` y `reel` (`guiado` en
  `FORMATOS_LOTE`): la IA escribe además su guion y cada idea pasa por el camino de a mano —`crearCarruselDeIdea`
  (propuesta + láminas) y `crearReelDeIdea` (planos + fotogramas + video)—, uno detrás de otro; sin revisión entre
  medias: los tramos y las láminas se corrigen después en el Estudio. Los personajes del kit también van en el lote.
- **«Mes completo» sigue la plantilla de plan del cliente** («Según su plan», `formato: "plan"` en EstudioLote, que
  arranca así si el cliente tiene plantilla): cada día sus formatos y varias por día. Al crear, primero las de una
  imagen (por formato: cambian la proporción y la plantilla) y luego carruseles y reels uno a uno; las láminas van con
  el modelo escogido si admite referencias (`modeloCarrusel`). El costo se suma por formato.
- **El lote del mes salta los días que ya tienen publicación** (`omitir` en `lote/mes`, `diasConPublicacion` en
  loteMes.js con `client.calendars`): antes «Mes completo» creaba una segunda encima. Todos ocupados: 400 sin llamar a la
  IA. Lo que ya hay se diseña con «Diseñar las que ya hay» (ProducirMes).
- **«De la galería» en una publicación** (`GaleriaSelector.jsx`, botón de `EditorMedios`): un carrusel o un reel es UNA
  tarjeta y tocarla escoge todas sus piezas en su orden; las sueltas, una a una con su número. Con algo ya puesto pregunta
  añadir o reemplazar; con el formato automático, dos o más lo vuelven carrusel (si no, se avisa). Se apunta el uso de
  cada una. Desde «Crear con IA», el visor de un carrusel tiene «Usar el carrusel en la publicación» (`onUsarVarias`, que
  AÑADE; en un reel, sólo el video). Va lazy: `lib/estudio.js` no puede entrar al arranque.
- **«Mandar el carrusel a la papelera»** (VisorGrupo, con segundo toque): se va TODO lo de su carpeta (`todas`), también
  las crudas sin texto y las versiones viejas, y lo dice; avisa de las que usa una publicación (siguen viéndose ahí y la
  papelera no las purga). La carpeta se queda: sin piezas, la galería no la pinta.
- **El texto y el logo los diseña el MOTOR, y el CONTROL DE CALIDAD los vigila** (decisión de la agencia: una maqueta
  fija —foto, bloque de color, texto abajo siempre igual— se ve genérica; Nano Banana integra el texto con la luz y la
  composición y diseña mejor, aunque se equivoque en letras). `POST /api/estudio/<c>/archivos/<id>/control` (función
  «control de calidad», hueco «análisis»; worker/lib/estudio/control.js): la IA MIRA la imagen, transcribe el texto tal
  cual se ve y señala precios fuera del catálogo, el logo ausente o deformado (sólo si se le dio: `LINEA_LOGO` en el
  pedido), deformaciones y las reglas del kit. El veredicto NO es sólo de la IA: `compararTexto` compara palabra por
  palabra el texto esperado con el leído, con tildes y eñes (y dos letras de sitio cuentan un error), porque el modelo
  suele dar por buena «Sofa» donde dice «Sofá». El texto esperado: el que manda la pantalla, el de la plantilla encima o
  el del pedido (`textoDelPedido`: la línea del texto, la de la lámina o lo citado DENTRO de la escena mejorada). Queda
  en `estudio_archivos.ajustes.control` (la galería pinta «✓ Revisada» / «Revisar» con `data-control`, sólo CSS).
  · **Si sólo falla el texto, se corrige EDITANDO la misma imagen** (`corregirTexto`, `correccionDeTexto`: «donde dice X
  debe decir Y; conserva todo lo demás») con el modelo que la hizo si edita, o Nano Banana (`modeloParaCorregir`), se
  controla otra vez y se queda la que tenga menos errores (a igualdad, la original). Pedir otra desde cero perdería el
  diseño que salió bien. Un precio, el logo o una deformación no se corrigen solos: «Revisar», y decide una persona.
  · **Va solo** al terminar cada pieza del lote, cada lámina del carrusel (ANTES de que vaya de referencia a la
  siguiente: si no, el error se copiaría en la serie), «Diseñar las que ya hay» y el compositor (`terminarTrabajo`, que
  también estampa el logo). Va SIEMPRE: la casilla «Revisar cada pieza…» (`controlEncendido`, por navegador) se quitó. Con la plantilla, el
  texto lo pone la aplicación: no se controla. Si el control falla (sin saldo, sin red), la pieza sigue sin él.
  · En el visor, `ControlDeCalidad` (EstudioVisor.jsx): lo leído, lo mal escrito, «Corregir el texto» y «Revisar otra vez».
- **La tipografía REAL de la marca** (`kit.fuente`: { clave, nombre, muestra }; `FuenteDeMarca.jsx`, `POST
  /api/estudio/<c>/kit/fuente`). El archivo (TTF, OTF, WOFF, WOFF2, reconocido por sus bytes, ≤ 3 MB) va a
  `clientes/<c>/fuentes/`; el NAVEGADOR dibuja una muestra con él (`dibujarMuestra`: la marca, el abecedario con tildes
  y eñes, números) que se sube a la galería, y el kit guarda las dos (el servidor comprueba que sean de ESE cliente y
  existan). La muestra va de referencia con `toma: ["tipografia"]` (`referenciaDeTipografia`) en toda pieza donde el
  modelo escribe el texto —compositor, lote, «Producir el mes», láminas—: el motor diseña libre pero con la letra de la
  marca. La plantilla escribe con la fuente real (`cargarFuente` → FontFace desde /api/media, `font-src 'self'`).
  `fundirKit` la conserva.
- **El compositor del Estudio va al límite de su chunk (20 kB):** la lógica de sus referencias vive en
  `apoyosDelCompositor` (pieza.js, compartido), el control en controlEstudio.js y el visor en su chunk. Lo nuevo de la
  pantalla, fuera de Estudio.jsx.
- **Varios productos en una pieza**: `productosNombrados` encuentra TODOS los que nombra la idea («Sofá cama» no cuenta
  también como «Sofá») y `fotosDeVariosProductos` reparte los huecos: una foto de cada uno antes que la segunda de
  ninguno. «Fotos de productos» del compositor suma productos con la misma regla.
- **El kit de marca va en su chunk** (lazy en Estudio.jsx): el del Estudio tiene tope de 20 kB comprimidos
  (`rendimiento.bundle.test.js`) y lo pasó al sumar «Dame ideas» y la referencia por tipo.
- **El lote de anuncios cobra sólo al final** (`EstudioLote.jsx`, `POST /api/estudio/<c>/lote/ideas`, función «ideas de
  anuncios» en el hueco de redacción). La IA escribe titular, apoyo y escena por nivel con el catálogo (precio EXACTO),
  el estudio de mercado aprobado del producto y el cerebro para texto (nunca lo interno): eso es texto. Las ideas se
  revisan y se quitan, y el botón dice el costo total: ESA es la confirmación, así que cada trabajo va con `confirmado:
  true`. Las piezas van a una carpeta «Lote <producto> · <día>», de dos en dos (`crearLote`), con las fotos del producto
  y el logo si caben; en «plantilla» el texto se pone encima con `componerLamina` (en historia, al centro: abajo lo tapan
  los botones de Instagram). «Llevar al calendario» llama a `llevarAlCalendario` de App.jsx (que obtiene o crea el mes y
  mete la publicación por el guardado agrupado, como el asistente) y apunta el uso del archivo: sin `usado_en`, la
  papelera se llevaría la imagen de una publicación.
- **«Recrear un anuncio» no tiene ruta propia: es la referencia de la competencia** (`EstudioRecrear.jsx`, desde la
  pestaña Estudio o «Recrear como anuncio» del visor). Analizar es `POST /api/mercado/<c>/referencias` (Claude mira la
  imagen, Gemini ve el video; queda en el cerebro como nota INTERNA y en las referencias del estudio de mercado, y el
  archivo pasa a la carpeta «Competencia»), y la versión es `…/referencias/<id>/adaptar` con el producto. «Crear con
  mi marca» no crea nada: pone la versión en el compositor (`pedidoParaElCompositor`, src/lib/recrear.js) con las
  fotos del producto delante y el anuncio con `toma: ["composicion", "estilo"]` y la nota de que es de otra marca; el
  costo se ve allí. En video, el anuncio va como video de referencia con Kling Omni y sin texto en pantalla.
- **«Modo de foto» y «De temporada» son atajos de «¿Qué quieres?»** (`src/lib/modosFoto.js`, `temporada.js`,
  `calendario/avisoTemporada.jsx`). Rellenan la indicación que ya usan «Crear la imagen aquí», «Otra versión» y «Recrear»
  (el director la trata como lo que manda): no crean nada solos. Los modos son los de la sesión de fotos de producto de
  Higgsfield que no existían como composición (con manos, una persona lo usa, flotando, salpicadura, Pinterest); NO se
  sumaron a `COMPOSICIONES`, que rota el lote y aprende de la galería. La temporada es la MISMA pieza ambientada en una
  fecha del cliente (`fechasQueVienen`: sin delicadas ni ocultas; las que venden van antes de los feriados al recortar,
  o los cinco feriados patrios de noviembre dejaban fuera al Black Friday), sin inventar ofertas. Todo atajo cabe en los
  300 caracteres del campo (un test lo recorre). El aviso del mes (`fechaParaAvisar`: comercial, propia o escogida en 21
  días) va en `CalendarView`, que es de la carga inicial: por eso los textos viven aparte, en modosFoto.js, que sólo
  carga el panel. «Ahora no» se recuerda por navegador (`temporada-avisada:<cliente>`).
- **La fase 2 de las recetas de Higgsfield: portada, revisión del video y la serie del mes** (método público, MIT,
  `docs/licencias/higgsfield-skills.md`). Cosas que no se ven:
  · **«Portada que da clic»** (`src/lib/portadaClic.js`, `calendario/PortadaClic.jsx` dentro de «Portada del video») no
  tiene ruta propia: es «Crear la imagen aquí» (`crearImagenDelPost`) con la publicación cambiada —su `escena` es la de la
  portada (`escenaDePortada`: el concepto, una idea, el titular enorme, la zona segura del formato), `textoPieza` el titular
  (así el control lo lee letra por letra) y sin el pedido listo— y `opciones.proporcion` (9:16 o 16:9, que el post no
  dice). La vista a 120 px es un `<img>` a ese ancho (en reel, la ventana 3:4 del perfil): si ahí no se lee, no sirve.
  · **«¿Está listo este video?»** (`src/lib/revisionVideo.js`, `worker/lib/estudio/revisionVideo.js`, `POST
  /api/estudio/<c>/revisar-video`, función «revisión de video») va por `verVideo`, como «Extraer guion»: Gemini, o Meta
  por fotogramas (sin audio: la voz queda «sin saber», `porFotogramas`). El VEREDICTO lo pone el código (`veredictoVideo`):
  un no en el gancho, la voz o un defecto lo deja «No está listo» aunque el puntaje sea 9. Queda en
  `ajustes.revisionVideo` de la ficha: un video no cambia (una versión es otro archivo) y la segunda vez no se paga, salvo
  «Revisar otra vez».
  · **«Las piezas juntas»** (`src/lib/piezasJuntas.js`, `lib/hojaPiezas.js`, `worker/lib/estudio/serie.js`, `POST
  /api/estudio/<c>/serie`, función «piezas juntas»; en «Revisar el mes») mira el mes como SERIE, lo que la revisión de cada
  imagen sola no ve. El navegador junta hasta 24 en UNA hoja numerada (encajadas, sin recortar: el recorte escondería el
  logo) y la IA la mira con el kit: cuesta lo de una imagen. El servidor sólo acepta un JPEG de verdad (por sus bytes) y
  `leerSerie` sólo devuelve números que están en la hoja. **Nada de esto se ha probado contra Gemini ni Anthropic reales.**
- **Sin llave, el modelo no existe para la pantalla.** El compositor sólo lista los que tienen llave y, si el escogido
  no la tiene (un borrador, una llave quitada, un pedido de fuera), Estudio.jsx lo cambia al preferido. El recreador de
  video fijaba Kling Omni de HIGGSFIELD —sin llave en la cuenta—, y por eso «no se creaba el video».
- **La galería tiene una pestaña Drive** (`ExploradorDrive` en modo «escoger»): lo tocado se baja (`archivoDeDrive`), se
  sube a la galería y entra en el pedido. No le pases un `onError` en línea: está en las dependencias de su carga, y una
  función nueva en cada render la relee en bucle (y le llega un `Error`, no un texto).
- **El logo del carrusel tiene su hueco** (`referenciasDeLamina`): iba «si cabe», detrás de la anterior, la portada y las
  fotos, y en un modelo de 3 referencias no cabía nunca; un test exigía que se cayera. Ahora es el último y nunca se
  recorta (con 2 referencias o más), y `pedidoDeLamina({ conLogo })` dice dónde ponerlo: la imagen sola no basta.
- **El carrusel se crea lámina a lámina, y EN ORDEN** (`lib/carrusel.js`, `lib/carruselEstudio.js`,
  `calendario/CarruselIA.jsx`; también lo usa «Producir el mes»). Pedir las láminas a la vez salía con cada una de un
  estilo. Cada lámina es un trabajo del Estudio con la ANTERIOR y la PORTADA de referencia (más las fotos del producto
  y el logo si caben: `referenciasDeLamina`, por importancia), así que no se pueden pedir en paralelo.
  · **Dos modos de texto.** «ia»: el modelo lo escribe EXACTO (Nano Banana lo hace bien; puede fallar una letra, por
  eso «Rehacer esta»). «plantilla»: se le pide NO escribir nada y dejar el hueco, y `componerLamina` pone el texto con
  los colores del kit (`coloresPlantilla`: dominante de fondo, texto con contraste) y se sube como imagen nueva. En ese
  modo, lo que va de referencia a la siguiente lámina es la CRUDA, sin texto: con él puesto, el modelo lo copiaría.
  · **El guion se parte con `partirGuion`:** «Portada:/Slide N:/CTA:» (lo que escribe la IA), «---», numeradas o
  párrafos. Se pueden editar, quitar y añadir láminas antes de pedir; hasta 10 (Instagram).
  · **Nada se pone solo:** «Poner las N» (o «Añadir al final» / «Reemplazar lo que hay» si ya tenía) y entonces se
  apunta el uso de cada lámina. Todo queda en la galería, también las crudas.
  · Lo orquesta el NAVEGADOR (cada lámina espera a la anterior): cerrar a la mitad deja hechas las que salieron, en
  la galería. El cron no encadena láminas.
- **El carrusel con IA es un flujo de tres pasos, el mismo en la pestaña Estudio («Carrusel» en «Qué crear») y en
  «Crear carrusel con IA» de la publicación** (`components/FlujoCarrusel.jsx`, lazy). Como en Flow: (1) guion o tema,
  tipo de pieza, estilo visual, producto y PERSONAJES; (2) la CONTRAPROPUESTA del director de arte (`POST
  /api/estudio/<c>/carrusel/propuesta`, `pedidoDePropuesta`/`leerPropuesta` en carrusel.js, texto): por lámina qué se
  ve, el texto EXACTO con su jerarquía y la composición, más el `hilo` que comparten todas; se corrige antes de gastar
  («Usar el guion tal cual» se la salta); (3) las láminas una a una (`crearCarrusel`) en una carpeta propia, con la
  anterior, la portada y los personajes de referencia. «Corregir esta» (`corregirLamina`) EDITA sólo esa lámina con
  una indicación —en plantilla, la cruda, y el texto se vuelve a poner encima—; «Rehacer esta» la pide otra vez.
- **Corregir con un ejemplo de la galería** (`ReferenciasGaleria.jsx`, `pedidoDeCorreccion` en lib/estudio.js): en el
  visor («Editar»), en cada lámina, en cada fotograma y en el tramo del video. La imagen que se corrige va PRIMERO y los
  ejemplos detrás, sólo los que quepan en el modelo, cada uno con su línea («toma SÓLO…» o «es un EJEMPLO…»); en el
  tramo, como mucho 5 (el video ocupa dos de los 7 huecos de Omni). El reel admite además referencias de la galería
  para todos los fotogramas (`crearFotograma({ referencias })`), detrás del anterior, el primero, los personajes y el
  producto.
- **El carrusel sigue el SISTEMA DE DISEÑO de su portada** (`src/lib/sistemaCarrusel.js`, `POST
  /api/estudio/<c>/archivos/<id>/sistema`, función «sistema de diseño», hueco «análisis»). Una referencia sola dice «algo
  así»: el titular cambiaba de tamaño y el texto saltaba de zona entre láminas. Al salir la portada, la IA la MIRA y
  escribe su sistema en medidas aproximadas (titular: tamaño, peso, mayúsculas, color; zona del texto; márgenes; fondo;
  colores; lo que se repite; el logo), queda en `ajustes.sistema` de la ficha (la segunda vez no se paga) y
  `crearCarrusel` lo pone en el pedido de cada lámina siguiente (`lineaDeSistema`, sólo de la 2 en adelante) y en su
  control: `pedidoDeControl({ sistema })` pide `serie`, lo que se sale de la serie, que deja la lámina en «Revisar»
  pero NO impide corregir sola una letra (`soloTexto` no lo cuenta). Lo usan también el lote y «Producir el mes» (el
  mismo `crearCarrusel`). En «plantilla» no se saca: el texto lo pone la aplicación. Si falla, null: las láminas
  siguen con la portada de referencia, como antes. En `FlujoCarrusel` «Primero la portada» (encendido con más de dos
  láminas) crea sólo la portada; «La portada va: crear las N que faltan» sigue con `crearCarrusel({ desde: 1, previas,
  sistema })`; rehacer o corregir la portada vuelve a sacar el sistema.
- **«Dame ideas» también en el carrusel y el reel IA** (`src/lib/ideasFormato.js`, `worker/lib/estudio/ideasFormato.js`,
  `POST /api/estudio/<c>/carrusel/ideas` y `…/reel/ideas`, `IdeasDeFormato.jsx`): de 3 a 5 con el catálogo (precio
  EXACTO), lo general del estudio de mercado y el cerebro para escribir (nunca lo interno). La de carrusel trae el
  guion «Portada: / Slide N: / CTA:» que lee `partirGuion`; «Usar» lo pone en el paso 1. Pasa `usados` para no repetir.
- **Un carrusel o un reel es UNA tarjeta en la galería** (0042: `estudio_carpetas.tipo` y `orden`; `agruparGaleria`,
  `piezasDeGrupo` en lib/estudio.js; `VisorGrupo.jsx`, lazy). El flujo crea su carpeta con `tipo` («carrusel» |
  «reel», `carpetaDeGrupo`) y guarda en `orden` las láminas FINALES (o los videos y los fotogramas) cada vez que
  cambian: `PUT …/carpetas/<id> { orden }` sólo acepta ids que están EN esa carpeta. Sin orden (se cerró a la mitad),
  la galería lo deduce: las láminas por fecha sin las crudas que ya tienen su versión con texto. Sólo se agrupa en
  «Todas»; en su propio filtro (chip que aparece al abrirla con «Ver sueltas») y en los demás, pieza a pieza. Las
  carpetas con tipo NO cuentan en las 30 de la persona (`MAX_GRUPOS`, 300) ni salen en «Mover a carpeta». En el lote,
  cada carrusel y cada reel van a SU carpeta, no a la del lote. «Descargar el carrusel» baja las piezas y arma un ZIP
  sin comprimir en el navegador (`src/lib/zip.js`: PNG y JPEG no ganan nada comprimidos; sin librería).
- **La galería no guarda dos veces la misma imagen** (`estudio_archivos.huella`, SHA-256 de los bytes, 0042). Sólo en lo
  SUBIDO a mano: una compuesta (con `origenId`) la crea el Estudio y un video no se carga entero. La misma imagen otra
  vez devuelve 200 con la ficha que había y `repetido: true` (si estaba en la papelera, vuelve) y la pantalla dice «Ya
  estaba en la galería». En otro cliente sí entra: cada galería es suya. Ojo en los tests: subir el mismo PNG tres
  veces son UNA ficha (`pngDistinto` en tests/migracion/estudio.test.js). «Usada» en la tarjeta y los filtros «Usadas /
  Sin usar» salen de `usado_en` (lo que una publicación usa). Etiquetas a mano no hay: carpetas, «Me gusta» y «Usada»
  cubren lo que se pidió.
- **Reglas que no se rompen** (`kit.reglas`, hasta 12 frases; `lineaDeReglas` en kitMarca.js): lo que la agencia repetía
  en cada pedido (tamaño del texto, dónde va el logo). Van en `bloqueDeMarca` —TODA pieza— y en la revisión de marca, y
  `fundirKit` las conserva. «Guardar como regla» (`GuardarRegla.jsx`) junto a cada corrección (visor, lámina,
  fotograma) llama a `POST /api/estudio/<c>/kit/reglas`, que suma sobre el kit GUARDADO (no el que tenga abierto la
  pantalla) sin repetir; con 12, 409.
- **El logo: lo pone el modelo o lo estampa la aplicación, a escoger por cliente** (`kit.logoModo` «modelo» |
  «estampado», `kit.logoPosicion` { esquina, tamano, margen }; `src/lib/logoEncima.js`, `logoEstudio.js`). «modelo» es lo
  de siempre (referencia, `ponerLogo`). Con «estampado» `ponerLogo` devuelve false (el modelo NO lo recibe) y el
  navegador pega el original al terminar: en el compositor (al acabar el trabajo, `paraEstampar` en Estudio.jsx), en
  cada lámina del carrusel (la CRUDA sigue sin logo: es la que va de referencia y la que se corrige), en el lote y en
  «Producir el mes». Sale como pieza NUEVA con `origenId` (la original se queda). «Estampar el logo» del visor funciona
  en cualquier modo. Lo que piden el asistente y Claude por MCP va por un encargo del servidor y el logo lo estampa el
  Container (`acabarPieza`); sin Container, la pantalla al abrirse (`terminarPendientes`).
- **Los personajes de la marca** (`kit.personajes`, hasta 4: nombre, descripción, retrato y cuerpo de la galería): el
  bebé de Baby Caleb tiene que ser EL MISMO en cada lámina y cada pieza. Van de referencia con `toma: ["persona"]` y una
  nota de quién son (`referenciasDePersonajes`), en el compositor («Personajes de la marca») y en el carrusel; el
  servidor sólo guarda imágenes de ESE cliente (`guardarKit`), y «Volver a preparar» no se los lleva (`fundirKit`).
- **«Mejorar idea» ya NO resume: en una imagen diseña el DIRECTOR DE ARTE** (`worker/lib/estudio/fichas.js`, `POST
  /api/estudio/<c>/fichas`; `mejorarIdea` de prompt.js lo llama con una pieza; un VIDEO sigue con la mejora corta de 60
  palabras, porque va limpio). Por qué: las piezas del asistente salían muchísimo mejores que las del Estudio, y el motor
  era el mismo —lo distinto era el PEDIDO—: el asistente escribía una instrucción de diseño gráfico (zonas, placas,
  códigos de color, tamaño del titular) y «Mejorar idea» devolvía dos frases describiendo una foto. Ahora toda pieza de
  imagen lleva una FICHA DE DISEÑO (`FORMATO_FICHA` en `src/lib/director.js`: Pieza, Composición, Fondo, Imagen
  principal, Texto exacto, Marca, Evitar), escrita con el MANUAL DEL DIRECTOR (Ajustes → Manual de la agencia,
  `manual_campanas.diseno`; vacío vale `MANUAL_DISENO_BASE`), el kit, la identidad visual del cerebro, el catálogo y las
  plantillas del cliente. Función «director de arte», hueco «prompts» (en Ajustes se llama «Director de arte»). Cosas que
  no se ven:
  · **Una tanda es una SERIE**: el concepto de la primera pieza pasa a las demás (ver «El director piensa CADA pieza»). Lo
  que ya trae la ficha DEL DIRECTOR no espera; el borrador del motor de ideas, sí.
  · **La ficha va SIN líneas en blanco** (`limpiarFicha`): `ideaDelPedido`/`conOtraEscena` parten el pedido del motor por
  ellas, y una ficha con huecos perdía media escena.
  · **El texto exacto no se pierde**: si la IA lo reescribió, `asegurarTexto` le añade la línea «Texto exacto…» en vez de
  tirar la ficha (antes `leerProduccion` tiraba el pedido listo por una letra cambiada). Lo usan el director, el motor de
  ideas (el campo `imagen`, que ahora ES una ficha, con el kit delante: `identidad` en `pedidoDeProduccion`) y el lote.
  · **Lo que pide la agencia MANDA**: «¿Qué quieres?» del post, la nota de «Otra» del lote y la «Indicación para toda la
  tanda» van al director como `indicacion` y DELANTE del pedido (`lineaDeIndicacion`: «LO QUE PIDE LA AGENCIA (manda…)»).
  Antes iban detrás como «Además, la agencia pide…» y, si chocaban con la escena, el motor se quedaba con la escena.
  · **El pedido listo del post (`promptImagen`) es la ficha**, con su huella: «Crear la imagen aquí» y «Producir el mes»
  la usan sin esperar; un comentario o una plantilla escogida la rediseñan (y esa no se guarda).
- **El OFICIO va en toda pieza, con el manual que sea** (`OFICIO_VISUAL` en src/lib/director.js; `LINEA_OFICIO` en
  kitMarca.js; `LINEA_FOTOS_PRODUCTO` en referencias.js; `aspecto` en control.js). La prueba con Feria del Lente salió
  con el texto bien y TODAS las piezas con la misma plantilla de bandas apiladas (texto, foto, banda) y fotos de banco
  con luz plana: lo pedía el propio formato. Cosas que no se ven:
  · **La ficha tiene una línea «Fotografía»** (luz con dirección, temperatura en K, lente y apertura, superficie y
  sombra) y el oficio prohíbe las palabras vagas («buena luz», «alta calidad», «realista»…), los clichés (hojas para
  natural, destellos para premium, escudos, degradados, dorado con serifa) y pide UN solo gesto expresivo.
  · **El oficio va APARTE del manual**: un manual escrito por la agencia sustituye al de la casa entero (`manualDeDiseno`);
  el oficio no se sustituye. Va en las fichas, el carrusel y lo que sabe el asistente (chat y MCP).
  · **Sin texto en la imagen, una zona TRANQUILA de la escena** (`lineaSinTexto`, `FICHA_SIN_TEXTO`, ahora en
  director.js): «deja libre», «limpio y despejado» y «espacio negativo» hacían que el motor dibujara una franja de color
  plana encima. Ningún estilo de la casa dice «espacio negativo» ni «luz pareja» (un test lo recorre).
  · **El acabado va en toda IMAGEN con el kit puesto** (`oficio` en `componerPedido`, detrás del estilo): sin el kit, la
  idea va tal cual (lo decidió la persona), y en video no (va limpio). No prohíbe la placa o la banda que pida el diseño,
  NO impone una luz (el kit de Feria del Lente pide «luz uniforme, pareja, sin foco dirigido» y «fondo plano en crema»:
  la marca manda; si se quiere otra luz, se cambia el kit) y dice que las medidas no se escriben (Muse escribió un «10%»
  sacado de «logo … 10 % del ancho»).
  · **Una ficha que no cabe se ACORTA, no se corta ni se rechaza** (`ajustarFicha`): el bloque de la marca de un kit
  completo, el tipo, el estilo, el acabado y el logo ocupan ~2.400 de los 4.000 caracteres del pedido (MAX_PROMPT), y una
  ficha con su «Fotografía» pasa de 1.600. Antes el pedido se cortaba por el FINAL (la marca, el logo) o, por
  `crear_en_estudio`, se rechazaba entero. Ahora se quita primero «Marca» (la paleta la dice el kit; el sitio del logo,
  la composición), luego «Evitar» y «Fondo», y después se recorta la línea más larga por una palabra; la pieza y el texto
  exacto nunca. Lo usan `pedidoDePieza`, `conEscena` (encargos) y `crear_en_estudio` (que además lo dice).
  · **Y la ficha del director tampoco se corta por el final al LEERLA** (`limpiarFicha` → `ajustarFicha` a `MAX_FICHA`;
  `asegurarTexto` acorta lo demás para que su línea quepa). Con la línea «Fotografía» las fichas pasan de 1.800: la prueba de
  Feria del Lente (5-nov) llegó al motor con «titular «Tus lentes en 40 mi» y sin marca ni «Evitar», y `asegurarTexto`
  añadía el texto y el tope se lo volvía a quitar. El control «arregló» el texto que faltaba en UNA frase y titular, apoyo y
  botón salieron del mismo tamaño: `correccionDeTexto` dice ahora cada línea en su sitio y con su tamaño.
  · **Las fotos del producto se ENDEREZAN** (una línea, una vez, si va alguna): las del catálogo suelen ser del celular,
  inclinadas o desde arriba, y el motor copiaba ese ángulo y ese fondo; lo impreso, tal cual y sin traducir.
  `crear_en_estudio` (asistente y MCP) ya las nombra como el producto REAL (`refsDelCatalogo`): antes iban sin línea.
  · **El control mira el ACABADO** (`aspecto`: luz plana, plástico, HDR, franja plana, foto de banco, restos sueltos),
  hasta 2 con su arreglo. Solo no cambia el veredicto; si el director deja la pieza floja, va en su corrección DETRÁS
  de los arreglos de diseño, tres como mucho.
- **Las RECETAS: el cómo de una pieza como dato, y «Crear con Claude»** (`src/lib/recetas.js`, `worker/lib/recetas.js`,
  `worker/rutas/recetas.js`, `worker/lib/estudio/herramientasRecetas.js`, `Recetas.jsx`, 0061). Lo que hace Higgsfield con sus
  presets, aquí con los métodos de la AGENCIA (escritos con sus palabras: los de Higgsfield no tienen licencia) y lo del
  cliente dentro. Cosas que no se ven:
  · **Una receta es texto, no código**: el método lo lee quien diseña (el director de la aplicación o Claude por el
  conector) y usa las herramientas que ya existen. Hay 16 de la casa (imagen, carrusel, video con IA, video animado y
  guion); una nueva de la casa es añadir un objeto a `RECETAS_CASA`, sin migración ni pantalla. Las de la casa en el código; una fila de `recetas` con su id la
  sustituye (con `oculta`, la saca) y borrarla la restaura; las propias van detrás. Las cambian admin y editores (403 a un
  colaborador), como las plantillas de plan.
  · **«Crear con Claude» guarda el pedido UN día** (`handoffs`: el cliente, la publicación, las referencias de ESA galería
  y «¿Qué quieres?») y abre `claude.ai/new?q=` con un mensaje corto («/receta foto-heroe · cliente … · HANDOFF: <id>»).
  `?q=` no está documentado: el mensaje además se COPIA y se enseña. La ventana se abre ANTES de esperar al servidor (si no,
  el navegador la bloquea). Lo paga la suscripción de Claude y necesita el conector instalado en claude.ai.
  · **«/receta» se enruta por las instrucciones** (`REGLA_RECETAS`, en las del servidor MCP y en el sistema del asistente):
  se resuelve PRIMERO con `receta` (`ver_recetas` las lista), que devuelve el método y, con el handoff, la publicación con
  su texto exacto, lo pedido y las referencias COMO IMÁGENES. Un handoff caducado o de otro espacio no se canjea.
  · **«Crear aquí»** deja escrito «/receta <id>» en el director de la pestaña Diseño (`borrador` de ChatPanel; desde una
  publicación llega por la dirección, `?receta=&post=&pide=`, que se limpia al leerla); el director la lee con la misma
  herramienta. Desde una publicación: «Con una receta…» en «¿Qué quieres?».
- **El DIRECTOR también por MCP: Claude en claude.ai diseña en lote, ve, corrige y pone en el post**
  (`worker/lib/estudio/herramientasDiseno.js`; sólo en el MCP: el asistente de la aplicación tiene las suyas con el mismo
  nombre, en el navegador). `guia_de_diseno` da lo que el chat recibe en su sistema (el manual, la ficha, el kit, el
  catálogo, lo que la agencia corrige; `instruccionDeDiseno(manual, { canal: "mcp" })`, con la confirmación por TEXTO) y,
  como imágenes, sus plantillas y sus «Me gusta». `disenar_piezas`: cada pieza con la ficha de Claude o sólo con su idea
  (la diseña el director de la agencia, `fichasDeDiseno`); la primera llamada devuelve el plan con su costo y NO crea nada
  (salvo con «crear sin preguntar» fijado y dentro de su tope: entonces crea a la primera y lo dice),
  y sólo `confirmado: true` crea un ENCARGO del servidor (encargos.js: trabajo, proporción, control y una corrección). Un
  carrusel, en orden y en su carpeta de tipo carrusel (con tema y sin fichas, `propuesta`). Cada pieza se arma con el
  MISMO `apoyosDePieza` + `pedidoDePieza` que la pantalla, con la escena en «{{ESCENA}}»: por eso `pieza.js` importa de
  `galeriaPura.js` y no de `estudio.js` (el cliente HTTP no puede entrar al Worker). `estado_encargo` enseña lo listo como
  imagen; `corregir_pieza` edita la misma imagen (o la iguala a otra con `igual_a`); `poner_en_publicacion` pone lo de la
  galería en un post de cualquier mes y apunta su uso. Un logo «estampado» queda puesto cuando alguien abre el Estudio
  (necesita lienzo).
- **El asistente es el DIRECTOR CREATIVO del cliente** (`src/lib/director.js`, `src/lib/disenoChat.js`,
  `src/lib/herramientasDiseno.js`, `PlanDePiezas.jsx`). Con un cliente, el Worker le pone en el sistema el manual, la
  ficha, sus herramientas y lo que exige su kit (o que NO tiene kit: lo dice y ofrece prepararlo) —`instruccionDeDiseno`,
  `resumenDelKit` en worker/rutas/chat.js—. Cosas que no se ven:
  · **`disenar_piezas` (1–12 fichas) espera un BOTÓN**: la herramienta enseña el plan con su costo y su promesa no se
  resuelve hasta «Crear» o «Cambiar algo» (como `guardar_en_cerebro`); con «crear sin preguntar» fijado y dentro del tope,
  la tarjeta llega ya creando, sin botón. El botón es la confirmación del costo, como en el
  lote; «Con qué modelo» escoge entre el del cliente y otra opción (`MODELOS_FINALES`). NO son «borrador» y «final»
  (decisión de la agencia: lo de Muse casi siempre ES la pieza que se usa); el asistente no ofrece `version_final` por
  su cuenta, sólo si la persona pide otro modelo. Se crea de 3 en 3 (`crearPlan`) con el control
  y el logo estampado; las de una publicación se ponen en ella con su ficha como pedido listo.
  · **El modelo VE lo que crea**: cada imagen vuelve en el `tool_result` como bloque de imagen (`paraElModelo`, copia de
  768 px en JPEG; el resultado lleva texto + imágenes). Antes recibía «Imagen creada» y diseñaba a ciegas.
  · **Las vueltas de diseño no gastan del tope** (`HERRAMIENTAS_DE_DISENO` en ChatPanel: crear, corregir, mirar, la regla
  y `crear_publicacion`): doce piezas eran doce vueltas y salía «Me quedé sin vueltas». Tope normal 10, total 40.
  · `corregir_pieza` edita la misma imagen y la nueva sustituye a la anterior en el mensaje y en la publicación; acepta el
  id o la CLAVE (el botón «Pedir un cambio» de una imagen del chat deja «En la imagen clientes/…:» en la caja).
  `guardar_regla` suma al kit (sólo con el sí de la persona). Las definiciones viven en `herramientasDiseno.js` y NO en
  api.js: api.js va en el bundle principal, y con ellas la carga inicial pasaba de 180 kB.
- **Las versiones de una pieza son UNA tarjeta en la galería** (`apilarVersiones` en lib/estudio.js; `deArchivo` en
  `ajustes`, que ponen `paso` en trabajos.js para toda edición y `herenciaDe` en galeria.js para lo compuesto o estampado).
  Cada pieza dejaba de 2 a 4 archivos casi iguales (la cruda y la del texto, la corrección del control, la recompuesta a
  4:5, la del logo estampado, lo corregido desde el chat). En «Todas» se ve una por pieza —la que usa una publicación; si
  no, la que gusta; si no, la que pasó el control; si no, la más nueva— con «N versiones», y el visor enseña las demás
  (`anteriores`). En los demás filtros, todas sueltas; lo de un carrusel o un reel no se apila (su carpeta ya lo agrupa).
  Las ediciones de antes, sin `deArchivo`, se reconocen por su trabajo (sólo los 40 últimos que lee la galería).
- **«Vaciar la papelera» no vaciaba, por tres cosas** (`vaciarPapelera`, `usosVivos`, `leerGaleria` en
  worker/lib/estudio/galeria.js; `NULO`/`NO_NULO` en acceso.js; `vaciarDelTodo`, `textoDeVaciar` en lib/estudio.js):
  · **`usado_en` se apunta al poner un archivo en una publicación y NUNCA se quita**: una imagen cambiada por otra, o de una
  publicación borrada, quedaba «en uso» para siempre. Ahora cuenta sólo el uso VIVO: la publicación sigue en su calendario
  y sigue llevando ESA clave (en cualquier sitio de su JSON). Una lectura de `calendars` y sólo si alguna fila tiene usos.
  · **20 por clic**, y **la papelera iba dentro de los 300 más recientes**: con una galería grande, lo viejo de la papelera
  ni se veía. La galería y la papelera se leen aparte (`borrado_at: NULO` / `NO_NULO`, el «is null» que la capa no tenía:
  un `null` a secas sigue siendo `= ?`); vaciar borra hasta `MAX_PAPELERA` (500) por llamada, R2 por lotes (una
  petición) y la pantalla repite mientras `mas`.
  · **No decía por qué se quedaba algo**: devuelve `quedan` con el motivo (la usa la publicación del día X, es el logo…),
  y cada tarjeta de la papelera lo dice.
- **Mandar VARIAS a la papelera era una petición por pieza** (`variasAPapelera` y `MAX_LOTE` en
  worker/lib/estudio/galeria.js, `POST /api/estudio/<c>/papelera { ids }`, `variasALaPapelera` en lib/estudio.js):
  seleccionar 60 imágenes eran 60 POST en serie, tardaba, y si una fallaba a la mitad el lote quedaba partido con el
  mensaje «Se mandaron 12 de 60». Ahora los ids van en UNA llamada y las filas se marcan en un lote de D1
  (`acceso.actualizarVarios`); lo de la MARCA no corta el lote: se salta y se dice en `quedan` (como al vaciar), y lo
  que ya estaba en la papelera no se vuelve a fechar. Tope `MAX_LOTE` (500) por llamada, con `mas` para repetir.
- **Quitar una carpeta y querer que se vayan sus piezas** (`borrarCarpeta(…, { conArchivos, protegidas })`,
  `DELETE …/carpetas/<id>?con_archivos=1`): la carpeta es una ETIQUETA y quitarla nunca borró nada —sus piezas vuelven a
  «Sin carpeta»—, que es lo que necesitan «Desagrupar» y los carruseles. Eso se queda igual por defecto; la opción manda
  sus piezas a la papelera ANTES de quitarla (30 días para recuperarlas) y las de la marca se quedan. En la pantalla son
  DOS botones («Quitar la carpeta» y «Quitar con sus piezas», éste con segundo toque), no un `confirm()` del navegador.
- **Lo de la marca no va a la papelera** (`enviarAPapelera(…, { protegidas })`, 409 `de_la_marca`; `deLaMarca` en cada
  archivo de GET /api/estudio). El logo, las fotos del catálogo, las plantillas, la muestra de la letra y los personajes
  llevan «Marca» con un candado y sin botón de papelera; seleccionadas en grupo, se saltan y se dice (`sinLasDeLaMarca`).
  Para quitarlas hay que cambiarlas primero en el kit o en el catálogo.
- **«Falta una imagen de la marca» ya se puede quitar** (`POST /api/estudio/<c>/kit/perdidas`, botón del aviso del kit):
  sale del kit y del catálogo GUARDADOS lo que ya no existe en R2. Hasta ahora sólo se escondía al leer y el aviso no se iba.
- **El logo: las dos formas siguen, y ninguna se lo inventa** (`LINEA_LOGO`, `lineaSinLogo`, `pideLogoDeReferencia` en
  kitMarca.js; `escaleraMuse`/`pedidoDelPaso` en worker/lib/estudio/meta.js; `tocaEstampar` en logoEstudio.js). La agencia
  quiere poder escoger: «lo integra la IA» (el logo va de referencia) o «lo estampa la aplicación» (el original encima). Se
  escoge en el kit y, para una tanda del director, en la tarjeta del plan («El logo»; `conModoDeLogo`). El logo salía
  inventado por cuatro cosas:
  · **Muse descartaba las referencias por el final, y el logo va el último:** era lo PRIMERO que se caía, y el pedido seguía
  diciendo que había logo. Ahora la escalera recorta lo de delante y deja el logo hasta el final; con menos referencias, el
  pedido dice cuáles van («OJO: sólo van…»). Si al final sale sin ninguna, la línea del logo se cambia por «no dibujes
  ningún logo» (`LINEA_LOGO_FUERA`) y el archivo queda con `ajustes.logoFuera`: todo camino que estampa (`conLogoSiToca`,
  `terminarTrabajo`, el carrusel, los encargos del servidor con `navegador.logo` y `forzar`) le pega el original. Una
  EDICIÓN de esa pieza (la corrección del control, la recompuesta) hereda la marca (`editaUnaSinLogo` en trabajos.js); la
  ya estampada no (`herenciaDe` la quita con la plantilla «logo»: si no, corregirla lo estamparía dos veces).
  · **«Una de las imágenes… si aparece» no decía cuál**, entre fotos del producto, plantillas y la muestra de la letra. Ahora
  dice que es la ÚLTIMA y que es la firma. La de antes (`LINEA_LOGO_ANTERIOR`, en los pedidos guardados) se sigue
  reconociendo.
  · **Sin logo de referencia no se decía nada**, y la ficha («Marca: el logo arriba») o la guía del cerebro («toda pieza
  lleva logo») hacían que el motor dibujara uno. Ahora va `lineaSinLogo` (también SIN kit: D'CASA no lo tenía preparado) y
  los logos de la foto REAL de un producto de otra marca se respetan.
  · **El director no sabía que el kit no tenía logo:** `kitVacio` no mira el logo (un kit con sólo el logo contaba como
  vacío) y «Logo: el kit no tiene logo» no le decía qué hacer. Ahora lo dice a la persona y no lo pide en la ficha
  (`SIN_LOGO_EN_LA_FICHA`, también en `pedidoDeFichas` y `pedidoDeCarrusel` con `conLogo`).
- **Lo diseñado se PONE en el post sin volver a crearlo** (`poner_en_publicacion`; `piezasParaPoner`, `postConPiezas` en
  src/lib/disenoChat.js; `cambiarPublicacion` en App.jsx). El asistente sólo podía poner una pieza AL CREARLA (`post_id` de
  cada pieza), y en un carrusel eso iba lámina por lámina: si no lo ponía en todas, no se ponía ninguna, sólo en el mes
  abierto, añadiendo a lo que había y sin cambiar el formato. Al pedirle «ponlo en el post» no tenía herramienta y lo
  volvía a diseñar (y a cobrar). Ahora `disenar_piezas` con `carrusel: true` lleva UN `post_id` para todo el carrusel y
  devuelve `carrusel_id`, y `poner_en_publicacion` pone un carrusel entero (en el orden de la galería) o sueltas, en un post
  de CUALQUIER mes (`onCambiarPublicacion` parte de lo pendiente de ese mes), reemplazando o añadiendo; con dos imágenes o
  más el post pasa a carrusel, y se apunta el uso de cada pieza.
- **La pestaña «Diseño»** (`/cliente/<slug>/diseno`, `DisenoDirector.jsx`): el MISMO ChatPanel, `incrustado` (en la
  página, `role="region"`, sin foco atrapado) y `tema="diseno"`. Sus conversaciones llevan `chat_conversaciones.tema =
  'diseno'` (0047): las ve todo el equipo, también desde el chat (con la etiqueta «Diseño»), y la última abierta se
  recuerda aparte (`chat-ultima:<cliente>:diseno`). Es pestaña y no un modo del Estudio porque el chunk del Estudio está en
  su tope de 20 kB (por eso también `EleccionRanura` y «Guardar como plantilla» van lazy).
- **Las PLANTILLAS del kit** (`kit.plantillas`, hasta 12: id `plantilla-…`, nombre, uso post|historia|portada|lamina,
  clave, sistema; `worker/lib/estudio/plantillas.js`, `POST|DELETE /api/estudio/<c>/kit/plantillas`). «Guardar como
  plantilla» del visor hace que la IA mire la pieza UNA vez (`sistemaDePortada(…, { para: "plantilla" })`, queda en
  `ajustes.sistema`) y la pase al kit. Al usarla, su imagen va de referencia sólo por su diseño (`referenciaDePlantilla`:
  composición, estilo y tipografía; nunca su contenido) y su sistema escrito detrás de la escena
  (`lineaDePlantillaEnPedido`). Se escoge en el compositor, en el lote («Plantilla» para toda la tanda), en «Crear la
  imagen aquí»; el director la elige solo cuando encaja (`plantilla` en su respuesta) y el lote y las historias ponen su
  imagen. `fundirKit` las conserva; el servidor sólo acepta claves de ESE cliente. plantillas.js va aparte de kit.js a
  propósito: control.js lee mercado.js, que lee kit.js (sería circular).
- **Las 3 historias del post salían con faltas porque el motor de imagen INVENTABA el texto** (y siempre con el primer
  Nano Banana). Ahora van por el Estudio (`src/lib/historiasEstudio.js`): el director escribe las tres fichas con su texto
  exacto, cada una con el modelo del cliente (si admite referencias), su kit, las fotos del producto y la imagen del post
  de referencia (`toma: producto, estilo`, «no la repitas»), las zonas seguras de historia y el control que corrige la
  letra mal escrita. Lo que no se escoge va a la papelera del Estudio. **La encajada, siempre; las 3 con IA, sólo con su
  botón** (decisión de la agencia: un post que no gusta no paga tres historias; apagable por navegador `historias-solas`):
  cuando el post RECIBE su primera imagen —no al abrir uno que ya la tenía— se prepara la encajada (la misma imagen en
  9:16, gratis) y se marca «Publicar también como historia». Recuerda de qué imagen salió (`post.encajadaDe` { de, src }):
  si la imagen del post cambia (otra versión, corregida) y la encajada sigue puesta, se REHACE en su sitio
  (`queHacerConLaEncajada`, publicacion.js); quitada a mano, ya no. El modelo de las 3 se escoge en el panel («Modelo de
  las 3 con IA») y se guarda en el kit (`kit.modelos.historias`, una imagen que admita referencias; lo comparte el
  equipo); vacío, el del cliente si admite referencias o el mejor que sí (`modeloDeHistorias`).
  La ruta vieja (`historiaDe` en /api/generar-imagen) sigue, pero ya no la llama la pantalla.
- **«Crear la imagen aquí» escoge tipo, estilo, modelo y plantilla** (`OpcionesCrearAqui.jsx`, lazy: arrastra el
  catálogo; sólo para esa publicación: recordado por navegador en `crear-aqui:<cliente>`, la siguiente salía con la
  plantilla o el estilo de otra sin que nadie lo viera). Vacío es lo de siempre: el tipo del post, el estilo de ese tipo, el
  modelo fijado y ninguna plantilla (o la que escoja el director, que ahora también llega al motor).
- **El texto bien colocado** (donde más se equivoca el diseño no es la ortografía: es dónde va el texto y de qué tamaño).
  · **La ficha lleva medidas:** `FORMATO_FICHA` pide la composición y el tamaño del texto en % de la pieza («titular entre
  el 8 y el 22 % de la altura, 80 % del ancho») y el manual de la casa lo exige («arriba» o «grande» no le dicen nada al
  generador).
  · **Ajustes de un toque** (`AJUSTES_DE_TEXTO` en lib/estudio.js: más arriba, más abajo, más pequeño, más grande,
  centrar): cada uno es una EDICIÓN precisa de la misma imagen. En el visor (`AjustarTexto`, sale una nueva), en cada
  lámina de «Carrusel con IA» y en «¿Qué quieres?» del post (rellenan la indicación de «Corregir esta»).
  · **«Igualar el texto a…»** (`IGUALAR_TEXTO`, `ejemploParaIgualar`): la lámina que se salió de la serie se edita con la
  buena de referencia, sólo por su composición y su letra. En el visor (las otras imágenes de su carpeta de carrusel), en
  «Carrusel con IA» («Igualar el texto a la portada») y en el chat (`corregir_pieza` con `igual_a`).
- **UN solo director para todo** (decisión de la agencia: el chat daba un 8 y el lote menos, y era porque iban por
  caminos distintos). Tres cosas lo igualan:
  · **El mismo modelo:** la función «director de arte» (fichas del lote, «Producir el mes», el post, las historias, los
  carruseles) cae en el hueco «asistente» (`FUNCIONES_IA`), no en «prompts»: diseña con el modelo del chat. En Ajustes el
  hueco se llama «Asistente y director creativo»; «prompts» quedó en «Escenas de imagen» (otra versión distinta, video).
  · **Ve lo mismo:** `vistasDelCliente` (lib/estudio.js) manda hasta 4 copias de 512 px de las plantillas del kit y los «Me
  gusta» con `fichasDeDiseno`, `mejorarIdea` (imagen) y `proponerCarrusel`; el Worker las limpia (`limpiarVistas`: sólo
  imagen en base64, tope de tamaño) y las pone DELANTE del pedido (`conVistas`, `lineaDeVistas`). Se recuerdan 10 minutos.
  · **Sabe lo que la agencia corrige:** `correccionesDelCliente` (worker/lib/estudio/fichas.js) lee los últimos pedidos de
  EDICIÓN del Estudio del cliente y `correccionesRecientes` (director.js) saca la indicación («el titular más arriba»),
  sin las que hace sola la aplicación (la letra del control, «donde dice…»; la recomposición). Van al director de arte,
  al carrusel y al sistema del chat (`lineaDeCorrecciones`). `leerColumnas` admite ahora un `limite`.
  · **El carrusel lo diseña el director** (`pedidoDeCarrusel`, `leerCarrusel` en director.js; worker/lib/estudio/carrusel.js):
  la «contrapropuesta» de antes (qué se ve y composición en una frase, sin manual, kit ni plantillas) se quitó. Ahora
  devuelve el SISTEMA de la serie con medidas (`REGLA_SERIE`: el titular en la misma zona y del mismo tamaño en todas) como
  `hilo` y una FICHA por lámina con su texto exacto; `pedidoDeLamina` la sigue («FICHA DE DISEÑO DE ESTA LÁMINA») y
  asegura el texto de la lámina aunque se cambiara después (en plantilla quita la línea del texto). Lo usan «Carrusel con
  IA» (paso 2: el texto y la ficha plegada, editable), el lote, «Producir el mes» (con «Que el director diseñe»
  encendido) y el asistente: `disenar_piezas` con `carrusel: true` va por `crearCarrusel` (en orden, con la anterior y la
  portada de referencia, el sistema de la portada y el control), no pieza a pieza.
- **El director piensa CADA pieza, como en el chat** (decisión de la agencia: lo diseñado en el chat salía «infinitamente
  mejor» que el lote y que «Carrusel con IA»; `fichasDeDiseno` en worker/lib/estudio/fichas.js). Había cuatro diferencias:
  · **El motor de ideas se saltaba al director.** Su campo `imagen` (un borrador de ficha que escribe el REDACTOR junto con
  títulos, captions y hashtags, de seis en seis) iba directo al motor de imagen en el lote (`conFichas`, `pasoDeLote`),
  «Producir el mes» y «Crear la imagen aquí». Ahora sólo se salta al director su PROPIA ficha: `promptListo(post)` exige
  `promptImagenPor: "director"` (lo pone `conPromptListo`; `camposDePromptListo`, el del motor de ideas, lo deja vacío) y
  el borrador queda de respaldo (`{ cualquiera: true }`, «Mejorar» apagado o el director caído). Las fichas guardadas antes
  de esto no llevan la marca: se rediseñan una vez. `promptImagen` conserva sus líneas (antes `limpio` las juntaba en una y
  `fichaDelPedido` no la reconocía para la revisión del director).
  · **Una llamada por pieza.** La primera va sola y fija el concepto; las demás, de 3 en 3 a la vez (`A_LA_VEZ`; más, y la
  cuenta da 429), con el concepto y las ya diseñadas (`previas`, las dos últimas) para no repetir composición. En el
  servidor, `TANDA_FICHAS` (3) por paso y la primera sola; mientras haya una pieza lista y sitio, se CREA antes de seguir
  diseñando (`listaParaCrear`), y una que aún espera al director no se pide sin él. El contexto (kit, catálogo, cerebro,
  manual, correcciones) se lee UNA vez por tanda (`contextoDelDirector`).
  · **Razona con el nivel del ASISTENTE.** Todo lo que cae en el hueco «asistente» (`huecoDe`, el director de arte) usa
  `ia_razonamiento_chat` si el espacio puso uno (`prepararIA`); antes, el de redacción.
  · **Sabe lo que el chat sabe:** la ficha técnica del cerebro (`sobreLaMarca`, con `contexto(…, { para: "imagen" })`, que
  también da la identidad visual), el CATÁLOGO entero (`catalogo`, con `REGLA_PRODUCTOS`: nada inventado) y el proceso
  de diseño dicho como en una conversación (`RAZONA_COMO_DIRECTOR`). El carrusel (`propuestaDeCarrusel`) lee lo mismo y
  sigue en UNA llamada: es una serie con narrativa.
- **«Otra versión» es la MISMA pieza con otra composición, y el director la MIRA** (`encargoDeVersion` en
  worker/lib/estudio/prompt.js; `ideaDeOtraVersion` en src/lib/otraVersion.js). Salía rara y a veces sin texto por dos
  cosas: «Otra versión distinta» del visor reescribía la FICHA entera en una frase de 60 palabras (`pedidoDeVersiones`) y
  `conOtraEscena` la ponía en lugar del diseño; y la del post le pedía al director «DISTINTA, otra escena» sin enseñarle la
  imagen. Ahora, si la escena es una ficha (`esFicha`), cada versión la escribe el director con el MISMO texto (el de la
  publicación o `textoDeLaFicha`), una variación moderada (con varias, cada una por su eje: `EJES_DE_VERSION`) y la
  original delante como imagen especial (`especiales: [{ papel: "original" }]`, ver `PAPELES` en director.js). La
  pantalla manda la ruta (`original` / `src`) y `estudio.js` la convierte en una copia de 768 px.
- **«Recrear con mi marca» ya no copia** (decisión de la agencia: la otra marca la habría reconocido). Con la referencia
  delante, aunque se dijera «sólo la composición», el motor la calcaba. Ahora el DIRECTOR la mira (`papel: "inspiracion"`:
  la idea, el gancho y el tipo de composición, en una versión propia ligeramente distinta) y escribe la ficha con el
  catálogo; la imagen de otra marca NO va al motor de imagen. Si la publicación no dice qué producto, el director escoge
  del catálogo y van las fotos de los que nombra (`fotosDeLaPieza`). Sin director (sin saldo, caído) NO se recrea y se
  dice por qué: la referencia ya no va al motor ni de respaldo. Lo mismo en «Recrear un anuncio» del Estudio en imagen
  (`recrearAnuncioConLaMarca`); en video sigue el camino de video (`motorParaRecrear`, sólo modelos con llave).
- **Una publicación puede llevar VARIOS productos** (`post.productoIds`; `productosDelPost`, `conProductos` en pilares.js;
  `fotosDelPost` en estudio.js). `productoId` sigue siendo el principal —el primero que se escoge; lo usa la matriz— y
  `producto` junta los nombres («Sofá cama + Mesa»), que es lo que lee la IA al escribir. En «Tipo de contenido» se
  escogen como chips (`tipoContenido.jsx`) y en «Carrusel con IA» igual. Llegan al director (una línea por producto,
  «salen JUNTOS») y sus fotos van una de cada uno antes que la segunda de ninguno: «Crear la imagen aquí», «Otra versión»,
  «Recrear», las historias, «Crear con IA», «Producir el mes» y los carruseles.
- **El asistente diseña con el CATÁLOGO** (`catalogoParaDisenar` en worker/rutas/chat.js, en su sistema cuando hay
  cliente): cada producto con su id, su precio y si tiene fotos. `disenar_piezas` recibe `productos` (ids, de la tanda o de
  cada pieza) y sus fotos REALES van de referencia también en un carrusel (`fotosDeLaPiezaDelChat`); antes sólo se
  buscaban por el nombre en la ficha y, si no lo nombraba igual, el motor se inventaba el producto y la marca. Si no sabe
  de qué producto va, se le pide que PREGUNTE (con las opciones del catálogo); sin catálogo, que pregunte cuál y cómo es.
- **Toda pieza NUEVA de imagen de un cliente pasa por las mismas reglas que el lote** (fase 1 de
  docs/propuesta-lo-mejor-y-creacion.md; en producción, 151 de 430 piezas salían sin control). Lo que va por el servidor
  (lote, «Producir el mes», carrusel, `disenar_piezas`) ya lo hacía; ahora también el visor, «Otra versión», «Crear la
  imagen aquí», «Corregir esta», «Recrear con mi marca», «Recrear un anuncio», las historias con IA, «Generar en 4:5 con
  IA», `generar_imagen` del asistente y `crear_en_estudio`. Cosas que no se ven:
  · **El pedido listo va como un ENCARGO de una pieza** (`pasoListo`/`crearUnaEnServidor` en src/lib/piezaServidor.js,
  `mejorar: false`, la escena ya dentro, sin «{{ESCENA}}»): la proporción (se recompone si no casa), el control con UNA
  corrección (con el `texto` que debe decir) y el logo estampado si el kit lo pide (`navegador.logo`), aunque se cierre la
  pantalla. Lo que necesita lienzo lo pone la pantalla SÓLO con el encargo ya cerrado (`esperarEnServidor`): si hay
  Container, el servidor no lo cierra sin intentarlo, y así no se estampa dos veces. Una EDICIÓN (corregir, editar,
  recomponer) no se estampa otra vez (`estampar: false`, o si la pieza ya lleva `plantilla: "logo"`).
  · **La versión de una pieza va con la MARCA DE HOY** (src/lib/marcaDeHoy.js): «Otra igual» y «Otra versión»
  repetían el bloque de la marca, el logo y el acabado del día de la original (con el logo pasado a «estampado», salían
  dos) y cortaban el pedido con `slice(0, MAX_PROMPT)`, que se llevaba la marca y el logo. `conMarcaDeHoy` parte el
  pedido por sus trozos (los separa una línea en blanco), quita el logo de antes (la última referencia), las líneas de las
  referencias que ya no caben y pone el kit actual; si no cabe, `ajustarFicha` acorta la escena.
  · **«Versión distinta» la diseña el director también sin ficha** (`versionesDeIdea` en worker/lib/estudio/prompt.js: en
  imagen siempre por `encargoDeVersion`, «LA ESCENA DE LA PIEZA ORIGINAL»; sólo un video o el director caído van por las
  escenas cortas). El texto que se manda: el de la ficha, el del control o el del pedido (`textoDePieza` en
  lib/visorEstudio.js). Tras «Editar», el control compara el texto que debe QUEDAR (`textoTrasEditar`: con «X» → «Y», el
  cambio; si no se sabe, el del pedido).
  · **`crear_en_estudio` de una imagen es un encargo** (`imagenPorEncargo` en worker/lib/estudio/herramientas.js) con el
  modelo FIJADO del cliente si no se pide otro (y su relevo si no hace el formato con las referencias), el director si no
  llega una ficha, el control y el logo estampado. La confirmación de 0,50 $ y el presupuesto se miran ANTES de crear. El
  ID que devuelve es del encargo: `estado_trabajo` lo acepta (y `ver_estudio` lo enseña en marcha); su `origen`
  («asistente», «claude») llega a cada trabajo (`datos.origen` en encargos.js). encargos.js y vistaEstudio.js se importan
  en el momento (`import()`): estáticos cerrarían el ciclo con herramientasServidor.js. Un video, sin cambios.
  · **Las historias con IA enseñan el costo y piden el sí** (`costoDeHistorias`, `modelosParaHistorias` → `costos`; el
  botón dice «· unos X $» y un segundo toque las crea, salvo dentro del tope de «crear sin preguntar») y van en UN encargo de tres piezas. «¿Qué quieres?» del post les
  llega, y también al diálogo «Crear con IA» (que entonces no usa el pedido listo) y al director del carrusel
  (`indicacion` en `pedidoDeCarrusel`). «Crear con IA» lleva los productos secundarios (`inicial.post.productoIds`) y la
  plantilla que escoge el director va al motor (compositor, «Crear la imagen aquí», «Otra versión», «Recrear»).
  · **«Generar en 4:5 con IA»** (ajusteImagen.jsx) ya no va por /api/generar-imagen: `recomponerEnProporcion`
  (pedidoDeRecomponer, el modelo del cliente si edita y hace la proporción, si no el relevo) por el servidor con el
  control; el navegador sigue recortando a la medida exacta (Instagram no admite 896×1152).
  · **Fuera las preferencias por navegador que cambiaban el resultado** (decisión de la agencia): el control
  (`controlEncendido`, `estudio-control`), «Usar el kit en esta pieza» (`estudio-usar-kit:<cliente>`), «Diseñarla sola
  al abrir» (`estudio-mejorar-solo`), «En el Estudio / Aquí, rápido» (`post-acciones-donde`) y las opciones recordadas
  de «Crear la imagen aquí» (`crear-aqui:<cliente>`). Las claves viejas se quedan en los navegadores sin que nadie las
  lea. Las comodidades (pestaña, plegados, `historias-solas`) siguen.
  · **El visor del Estudio no espera**: manda el encargo, cierra y avisa si una pieza no salió (`alFallo`); la galería la
  enseña al llegar el aviso del encargo. La lógica vive en lib/visorEstudio.js (lazy): el chunk del Estudio estaba en
  20,3 de 20 kB y quedó en 19,7.
  · **Nada de esto se ha probado contra los servicios reales**: los tests hablan con dobles del servidor y de los motores.
- **Dos carruseles no se parecen: la ESTRUCTURA la pone el código** (`src/lib/estructurasCarrusel.js`). Todas las ideas
  salían «Portada / Slide 1…5 / CTA», y las de un mismo tipo, casi iguales. Hay 14 estructuras propias (errores comunes,
  mito o realidad, paso a paso, antes y después, comparación, lista, señales, preguntas, caso real, qué incluye, guía para
  escoger, detrás de cámaras, historia, un dato), cada una con su número de láminas y los tipos con los que encaja.
  `estructuraPara` rota dentro del tipo SIN las dos últimas que el cliente usó en ese tipo (`estructurasRecientes` en
  worker/lib/estudio/lote.js lee sus tres últimos meses: una consulta, sólo si el lote puede llevar carruseles). La pone
  `darForma` (lote, «Planificar mes», «Mes completo», «Generar»), va en la línea de cada pieza y en el guion
  (`GUION_DE_FORMATO.carrusel`), y la publicación la guarda (`post.estructura`) para que la siguiente no la repita. «Dame
  ideas» del carrusel da una distinta por idea (`estructurasDistintas`) y el director, con sólo un tema, sigue la de la
  publicación o una nueva (`estructura` en /carrusel/propuesta). Con un guion escrito, manda el guion.
- **Cada tipo de contenido se diseña a su manera** (`DISENO_POR_TIPO` en director.js: un anuncio con el producto
  protagonista y el precio; un educativo tipográfico y sin botón de compra; contenido humano con foto real y poco texto…).
  Va en las fichas del director (sólo los tipos de la tanda, `bloqueDeDisenoPorTipo`), en la ficha `imagen` del motor de
  ideas (`identidadParaFichas`), en el carrusel y en el sistema del asistente. La agencia lo cambia tipo a tipo en Ajustes
  → Manual → «Cómo se diseña cada tipo» (`manual_campanas.disenoTipos`, `limpiarDisenoTipos`); vacío, el de la casa. El
  tipo llega por su NOMBRE («Educativo / Informativo»): `tipoDeDiseno` lo reconoce (también los alias y las maletas).
  · **Una plantilla del kit puede ser LA de un tipo** (`plantilla.tipos`, chips en el kit): `fichasDeDiseno` la pone sola
  en las piezas de ese tipo y uso (post, historia, portada de carrusel; `plantillaParaTipo`) si nadie escogió otra y la
  pieza lleva su texto, y la línea de la plantilla dice «ES LA DE: …» para el asistente y el motor de ideas.
- **El DIRECTOR revisa cada pieza en la MISMA llamada del control** (`pedidoDeControl({ ficha })`, `leerControl` en
  src/lib/control.js; `fichaDelPedido` en worker/lib/estudio/control.js). Con la ficha del pedido delante (del «Pieza:» a
  la primera línea en blanco), compara dónde está el texto y de qué tamaño, la jerarquía y los márgenes, pone nota
  (`puntajeDiseno`) y da hasta 3 arreglos con números. Por debajo de `NOTA_MINIMA` (8) la pieza queda «Revisar» y es
  `corregible`: `controlarYCorregir` (todos los caminos: lote, carrusel, «Producir el mes», compositor, el post, las
  historias, el asistente) hace UNA edición con letras y arreglos juntos (`correccionDelDirector`), la vuelve a controlar
  con la ficha de la ORIGINAL (`ficha` en el POST: la edición no la lleva) y se queda la que `mejoro()`. Una edición como
  mucho por pieza: el costo tiene techo. Un precio, el logo o una deformación siguen sin tocarse solos. Las ediciones
  automáticas empiezan por `PREFIJO_AJUSTE` («Ajuste del director:») y `correccionesRecientes` las descarta: no son de la
  agencia. Sin ficha (una pieza a mano, una edición sin la original) no hay revisión del director. En el visor, su nota
  y «Aplicar los arreglos del director».
- **La proporción pedida es la que sale, y Muse se queda** (`respetaProporcion`, `modeloQueRespeta`, `relevoPara`,
  `fueraDeProporcion` en estudioCatalogo.js; `escaleraMuse` en worker/lib/estudio/meta.js). Muse Image es el modelo de la
  agencia (barato y se ve bien), y una serie con piezas de Muse y de Nano Banana se nota: NO se cambia de motor por la
  proporción. Si Meta rechaza la vía de medidas exactas (1024×1280 en 4:5) con las referencias, el Worker reintenta por
  ELLA con las 2 primeras, con la primera y, si no es una edición, sin ninguna; sólo después va a la de Responses (que da
  1:1, 2:3 o 3:2). Lo que dejó fuera queda en la NOTA del trabajo (`aviso`): si una pieza salió sin logo o sin la foto
  del producto, ahí está el porqué y lo que contestó Meta. La primera versión daba a Muse por incapaz de 4:5 con
  referencias (`conReferencias`) y la cambiaba sola a Nano Banana: la agencia ya no podía escogerla. `conReferencias`
  sigue en el catálogo para un modelo que de verdad lo necesite. GPT Image, Seedream e Imagen no tienen 4:5. Dos capas:
  · **Antes de crear:** `pedidoDePieza({ …, proporcion, activos })` cambia el modelo por el primero de `RELEVO_PROPORCION`
  con llave (Nano Banana 2 por Kie, luego el de Google…) si el escogido no la respeta con esas referencias; quien llama
  lee el modelo usado en `pedido.modelo` (para el costo y el nombre). Lo usan el director del chat, `generar_imagen`, el
  lote, «Producir el mes», «Crear la imagen aquí», «Otra versión», las historias, las láminas del carrusel
  (`crearLamina`, `corregirLamina`: un carrusel es 4:5 SIEMPRE), las correcciones (`modeloParaCorregir(…, aspecto)`) y la
  versión final. El compositor respeta lo que escoge la persona.
  · **Después, la red de seguridad** (`esperarArchivos` en carruselEstudio.js, por donde esperan todos): una imagen cuyas
  medidas no casan con el `aspectRatio` de su trabajo (4 % de margen: el 896×1152 de Nano Banana vale) se RECOMPONE en
  esa proporción (`pedidoDeRecomponer`: la misma pieza, sin recortar ni acercar; el texto no se encoge) con el MISMO
  modelo que la hizo y, sólo si vuelve a salir de otra medida, con el relevo; la nueva ocupa su sitio. Decisión de la agencia: NADA de recortar ni de «zona segura» (el texto quedaba pequeño).
- **«Agrupar como carrusel» en la galería** (`agruparComoCarrusel`, `desagrupar`, `moverEnOrden` en lib/estudio.js): con
  «Seleccionar», las imágenes tocadas pasan a una carpeta de carrusel EN EL ORDEN en que se tocaron y la galería las
  enseña como una tarjeta; en `VisorGrupo`, flechas para cambiar el orden (se guarda con `ordenarCarpeta`) y «Desagrupar»
  (borra la carpeta: el servidor devuelve sus piezas a la galería). Los carruseles del director (`disenar_piezas` con
  `carrusel: true`, todas 4:5) van solos a su carpeta y quedan en el orden del plan.
- **Editar una imagen no la toca: hace otra.** Es un trabajo con la imagen de
  referencia y `promptDeEdicion()` (la indicación + «conserva todo lo
  demás»), con Muse Image si hay llave de Meta y si no Nano Banana
  (`modeloParaEditar`). De qué original sale se sabe por su trabajo
  (`originalDe`): no hizo falta ninguna columna.
- **Muse Image: dos vías, y el error dice lo que contestó Meta en cada una.**
  Con la llave puesta, Meta contestaba 400 y la pantalla decía «Meta rechazó
  el pedido.» sin motivo: sólo se leía `error.message`. Ahora
  `llamarMuseImage()` (worker/lib/estudio/meta.js) pide primero por la API de
  imágenes con el tamaño EXACTO de la proporción (1024x1280 para 4:5; ya sin
  `response_format`, que las API compatibles con OpenAI rechazan para los
  modelos nuevos) y, si Meta la RECHAZA (400/404/405/415/422), por la API de
  Responses del recetario oficial (github.com/meta-models/meta-model-cookbook,
  `05_muse_image`: referencias como `input_image` dentro de un mensaje de
  usuario; `size` sólo 1024x1024, 1024x1536 o 1536x1024). Si las dos fallan,
  el error lleva «ruta → código: lo que dijo» de cada una (`motivoDe()`, sea
  JSON o texto) y queda en `estudio_trabajos.error`: es lo primero que hay que
  leer. Las proporciones del Estudio NO se recortan a las tres de Responses:
  la agencia ya genera con Muse en otros tamaños.
- **El control contaba el titular dos veces y daba por buena la pieza con el titular REPETIDO** (prueba real de Feria del
  Lente por `crear_en_estudio`, 5-nov). Sin texto dicho, el que debía decir la pieza salía de TODO lo citado en la escena
  (`textoDelPedido`), y la ficha del director nombra el titular en «Composición» y otra vez en «Texto exacto»: el control
  esperaba tres líneas, la corrección pidió «EXACTAMENTE así, en 3 líneas» y el motor dibujó el titular dos veces, que
  entonces sí casaba. Tres guardas: `textoDelPedido` cuenta cada texto UNA vez y, en una ficha, manda su línea «Texto
  exacto»; el encargo pone `p.texto` con `textoDeLaFicha` en cuanto el director escribe la ficha (si nadie dijo el
  texto); y `compararTexto` marca una LÍNEA esperada que sale en dos renglones (`repetido`; lo que sobra suelto, como el
  logo, sigue sin contar) y la corrección pide quitar la copia.
- **La confirmación de 0,50 $ se puede fijar: «Crear imágenes sin preguntar»** (decisión de la agencia: «que no me
  pregunten cada vez»; `ajustes_espacio.sin_preguntar_usd`, 0074; la regla, `decidirConfirmacion` en
  `src/lib/sinPreguntar.js`, la misma en el Worker y en la pantalla; Ajustes → IA, `SinPreguntarAjuste.jsx`). Nulo o 0 =
  apagado, como siempre. Encendido es un TOPE por pedido: una IMAGEN (pieza suelta, tanda del director, carrusel, las
  historias, otra versión, corregir, recrear, el lote) con el modelo del cliente que no pase del tope se crea sin el
  segundo «sí». Cosas que no se ven:
  · **El SERVIDOR decide, no la pantalla** (Claude por MCP no pasa por ella): `crearTrabajo` (el 409 `confirmar` lleva
  ahora `motivo`: «tope», «otro_motor»…), `crear_en_estudio` (`imagenPorEncargo`) y `disenar_piezas` por MCP leen el
  ajuste con `topeSinPreguntar` (una lectura, y sólo cuando el pedido preguntaría) y, si crean sin preguntar, la respuesta
  lo dice (`textoSinPreguntar`: «Se creó sin preguntar: la agencia lo tiene fijado en Ajustes → IA…»). La primera llamada
  de `disenar_piezas` por MCP ya crea; un carrusel con tema se compara con lo MÁS que puede costar (8 láminas).
  · **«El modelo del cliente»** es el fijado de su kit (`kit.modelos.imagen`) o, sin él, el predeterminado, más su relevo
  automático de proporción (cambiar al que hace la proporción no es escoger). En `crearTrabajo` lo dice
  `esModeloDelCliente` (estudioCatalogo.js: también el fijado para las historias y los de `RELEVO_PROPORCION`). En las
  herramientas, «otro motor» es sólo el que pidió el ASISTENTE (`modelo` distinto del del cliente): con el ajuste
  encendido se pregunta SIEMPRE, aunque sea barato, con «El asistente sugiere usar X en vez de Y (porque …)»
  (`textoSugerencia`, el porqué en `motivo_modelo`, que aceptan `disenar_piezas` —chat y MCP—, `generar_imagen` y
  `crear_en_estudio`). Si la persona se queda con el suyo, el asistente repite SIN modelo y sale directo. Con el ajuste
  apagado, otro motor barato sale como siempre (lo decide el costo). Lo que escoge una PERSONA para esta vez («Con qué
  modelo», el compositor) no es «otro motor»: ya lo decidió ella.
  · **Video, voz y música preguntan siempre** (`tipo` distinto de «imagen» no entra; locucion.js y musica.js ni miran el
  ajuste, y un test lo vigila). El presupuesto del mes («detener») se mira después, como siempre: sin presupuesto no se crea.
  · **En la pantalla**: el «¿Sigo?» del panel (`sigue` en otraVersion.js), el segundo toque de las historias, «Diseñar las
  aprobadas» (un video entre las piezas pregunta), «Carrusel con IA» y el compositor (GET /api/estudio trae `sinPreguntar`)
  leen el tope con `src/lib/sinPreguntarApi.js`, recordado UN minuto (si no se puede leer, se pregunta). En el chat, la
  tarjeta del plan (`PlanDePiezas`) llega ya «creando» sin botón; si pregunta, la casilla «No volver a preguntar» la ve
  sólo el administrador (`fijarSinPreguntar`: el doble del pedido redondeado, o 3 $) y a los demás se les dice dónde.
  Encenderlo o cambiarlo lo hace PUT /api/ajustes, sólo el administrador (403 a los demás), con el mismo CHECK que la base
  (0 a 1000). Las «Recrear para…» de «Lo mejor» siguen preguntando: crean además una publicación en un día.
- **La galería, ordenada: subir, cada video en su carpeta y las versiones que se escogen** (decisión de la agencia: «se ve muy
  desordenada cuando hago un reel»). Lo que no se ve en la pantalla:
  · **«Subir a la galería»** (cabecera de la galería, `subirALaGaleria` en lib/estudio.js): imágenes o videos sueltos, sin
  pasar por el pedido, a la carpeta que se mira. Antes sólo se subía DENTRO del compositor (y quedaba puesto en el pedido).
  · **Un video animado tiene su CARPETA de tipo «reel»** (worker/lib/estudio/carpetaVideo.js, `carpetaDelVideo`): al pedir
  sus fondos se crea («Video: <título>») y se apunta en `origen.carpetaId` (sin subir la versión), y lo que ya tenía suelto
  —sus renders (`ajustes.videoId`) y los fondos que su guion usa, sólo los que creó el Estudio— entra en ella. El video del
  MONTAJE de un reel usa la carpeta de su encargo. El render va a esa carpeta (delante en su orden, `alFrenteDelOrden`); sin
  carpeta, el mp4 nuevo es una VERSIÓN del anterior de ese video (`deArchivo`) y la galería los apila. Antes, fondos y mp4
  salían sueltos (30 renders sin carpeta en producción el 10-11-2026). Lo de antes se ordena solo la próxima vez que ese
  video pide fondos.
  · **Dos reels con el mismo título el mismo día compartían carpeta** (`carpetaDeGrupo` en la pantalla reusaba la que ya
  había, y sus piezas se mezclaban): ahora `crearCarpeta` le pone « (2)» a una de carrusel o de reel; una carpeta normal
  repetida sigue siendo 409.
  · **Dentro de un carrusel o un reel sin orden**, lo que ya tiene una versión más nueva en la carpeta (por `deArchivo` o
  la cruda de la plantilla) no se enseña (`piezasDeGrupo`).
  · **Las versiones en el visor**: la tira enseña TODAS (la que se ve marcada, «principal», «en uso»); tocar una ya no la
  abría sola perdiendo las demás (`verVersion`), «Me gusta» tampoco las pierde (`conVersiones`), mandar a la papelera la que
  se ve abre la siguiente (`trasQuitarVersion`), «Hacer la principal» (`principal` en POST …/archivos/<id>/cambiar →
  `ajustes.principalAt`, que `apilarVersiones` pone por delante de todo) y «Quedarme sólo con ésta» (las otras a la
  papelera; lo que usa una publicación sigue viéndose ahí y la papelera no lo purga).
- **Las referencias de estilo, la línea «Emoción», el kit desde imágenes y las variaciones para anuncios** (decisión de la
  agencia: dar al director y al motor un ambiente de marca, la intención de cada pieza, un kit sacado de lo que ya gusta y,
  de una pieza que funciona, las de un conjunto de anuncios; `src/lib/anclasEstilo.js`, `kitDesdeImagenes.js`,
  `variacionesAnuncio.js`; sin migración). Lo que no se ve en la pantalla:
  · **`kit.anclas` sólo se escribe si hay alguna** (un kit de antes queda igual, también su bloque de la marca) y SIEMPRE
  son genéricas: `avisoDeAncla` marca una marca conocida (también de película o de revista, en minúsculas) o una palabra
  con mayúscula a mitad de frase o seguida de un número. Las que avisan se GUARDAN (lo decide la persona, que ve el aviso)
  pero no van a ninguna pieza (`anclasUsables`), y lo que propone la IA («Preparar con IA», el moodboard) se descarta al
  leerlo. En el bloque de la marca van con tope (`MAX_LINEA_ANCLAS`: entran las que caben); `fundirKit` las conserva si la
  propuesta no trae.
  · **«Emoción» va detrás de «Pieza» en `FORMATO_FICHA`** y en `PRESCINDIBLES` entre Evitar y Fondo: al acortar, se va
  después de Marca y Evitar. Una ficha de antes, sin esa línea, se limpia, se acorta y da el mismo texto exacto que
  siempre (un test lo exige). `fichaDelPedido` la lee porque va dentro de la ficha (sin línea en blanco).
  · **El moodboard NO guarda**: `POST /api/estudio/<c>/kit/moodboard` (función «kit desde imágenes», hueco «análisis»)
  exige de 3 a 10 imágenes de ESE cliente (PNG, JPG o WEBP, fuera de la papelera: si una no lo es, 400 sin llamar a la IA)
  y manda copias de 512 px (`miniaturaDe`, importado EN EL MOMENTO: kit.js → miniaturas.js → cuadros.js → kit.js sería un
  ciclo); con menos de 3 copias, 503. La pantalla funde sólo lo visual (`fundirMoodboard`: una paleta vacía deja la de antes).
  · **Las variaciones van por `/versiones` con `para: "anuncios"`** (`variacionesParaAnuncios` en worker/lib/estudio/prompt.js)
  y por el director con la maestra como imagen especial (`papel: "maestra"`, nuevo en `PAPELES`) y un concepto fijo: cada
  ficha es una llamada y van a la vez. Con texto, los ganchos primero (el titular nuevo DELANTE y el resto exacto:
  `textoDeVariacion`); con la plantilla de texto encima (`sinTexto`), ningún gancho. Sin el director, NO hay respaldo: 502.
  · **Quedan juntas en una carpeta normal «Variaciones · <titular>»** (`carpetaParaVariaciones` en lib/visorEstudio.js: si el
  nombre existe, « (2)»…; con el tope de carpetas, sueltas) y la maestra entra si estaba suelta. NO se apilan como versiones
  (`deArchivo`): apiladas, la galería enseñaría una sola. Van con `uso: null`: no se ponen en la publicación desde la que se
  abrió el visor.
  · **El costo** es el de la versión del modelo × cuántas, con `decidir` (0,50 $ y «crear sin preguntar»); la llamada del
  director no se cuenta (es texto). La pantalla vive en VariacionesAnuncio.jsx (lazy): el chunk del Estudio está a 20,44 kB.
  · **Nada de esto se ha probado contra Anthropic ni los motores reales**: los tests usan un `fetch` de mentira.

- **Crear a mano es una sub-sección, no un desplegable** (`/cliente/<slug>/crear/a-mano`, src/lib/rutas.js; Crear.jsx). «Avanzado»
  era `useState(false)` debajo del chat del director y se cerraba en cada visita. Ahora el compositor está arriba en «A mano», la
  pestaña recuerda la última sub-sección y `enfocarPrompt` (lo que pone una pieza en el compositor desde otro sitio) navega ahí.
  En el diálogo de una publicación el compositor sale siempre (`conCompositor = dialogo || aMano`). Cosas que no se ven:
  · **El compositor va en su chunk** (lazy desde Estudio.jsx): eso liberó el chunk del Estudio, que estaba en su tope; lo nuevo del
  compositor va en `EstudioCompositor.css`, que sólo se carga con él. Su pie con «Crear» es `sticky`: `.est-compositor` lleva
  `overflow: visible` porque el `overflow: hidden` de `.card` lo despegaba.
  · **«De la galería» del compositor es un DIÁLOGO** (`EstudioElegir.jsx`): el modo «toca una imagen para ponerla» de la galería
  (`destinoGaleria`) se quitó; la galería (EstudioGaleria.jsx) conserva su prop `destino` por si vuelve, sin uso. Mientras la
  persona mira la galería, una tira «En el pedido» (IntersectionObserver sobre la zona del compositor) dice qué lleva y «Ir al pedido».
  · **El visor no se cierra al pedir una corrección u otra versión**: guarda `enCamino` ({ desde, texto }) y, cuando la pieza llega
  (por el aviso del encargo o la relectura), la abre (`abrirLaNueva`). Si el visor ya está cerrado, el aviso del Estudio trae «Abrirla».
- **Lo creado desde una publicación se pone en SU sitio aunque se cierre el panel** (`src/lib/piezaEnSuSitio.js`; `sitio` en el paso
  del encargo y `ponerResultados` en worker/lib/estudio/encargos.js). «Otra versión», «Corregir», «Recrear con mi marca» y «Diseñar
  con el director» de un post sin imagen ocupaban el sitio sólo si el panel seguía abierto; si se cerraba, la pieza quedaba sólo en la
  galería. Ahora el encargo lleva `sitio` ({ reemplaza: el src de la imagen tocada } o nada = añadir al final) y lo pone el que llegue
  primero: el panel (en su formulario) o el servidor al cerrar el encargo. `postConPiezaEnSuSitio` no la pone dos veces y, si la imagen
  tocada ya no está (se quitó a mano), no la pone. La publicación lleva `piezaEnCurso` mientras se hace: el panel guarda al cerrarse y
  podría pisar lo que el servidor acaba de poner, así que al volver a abrirlo la retoma y la pone. Pasado un día la marca se ignora.
  Y el costo se pregunta con la interfaz de la aplicación, no con `window.confirm`.

- **La galería va por PÁGINAS, y lo que no está cargado se busca en el servidor** (`archivosVivos`, `paginaDeGaleria`,
  `buscarEnGaleria` en worker/lib/estudio/galeria.js; `EstudioGaleria.jsx`, `hooks/useBusquedaGaleria.js`). Antes leía
  las 300 más recientes y ya: Baby Caleb tenía 401 piezas vivas y 101 no se veían ni se encontraban buscando. Lo que no
  se ve:
  · **Los audios no cuentan**: la página filtra `tipo <> 'audio'` en la consulta (la capa admite ahora `menorQue`,
  `mayorOIgual` y `distintoDe`, con el operador de una lista cerrada). Antes se filtraban DESPUÉS y una cuenta con muchas
  locuciones veía menos de 300.
  · **El cursor es la fecha de la última fila, y lo que comparte ese instante va entero en su página** (un lote apunta
  varias a la vez): la siguiente empieza ANTES de ese instante, así que cortar entre ellas se saltaría las de más. Por eso
  una página puede traer más de 300 (un test con 305 del mismo instante lo exige), y si tras ellas no queda nada más
  viejo, `siguiente` sale null (una consulta de una fila).
  · **`?hasta=`**: con «Cargar más», cada relectura de la pantalla (cada aviso del espacio, cada paso de un trabajo) relee
  TODO lo cargado, no la primera página (si no, se perdía lo cargado). Como mucho `MAX_HASTA` (3000). El cursor lo guarda
  Estudio.jsx en `hastaRef` (se suelta al cambiar de cliente).
  · **Buscar en el servidor usa LA MISMA regla que la pantalla** (`coincideConBusqueda`, src/lib/galeriaVistas.js):
  mientras quede una página por cargar, lo escrito se pregunta a GET …/galeria?q= (con 400 ms de espera, sobre las 3000
  más recientes, 150 resultados) y se suma a lo que se ve. Con todo cargado no pregunta nada.
  · **Lo de la MARCA llega aunque sea viejo**: `leerGaleria` suma a la página las fichas de lo protegido que no entró
  (`fichasDeLaMarca`, una lectura por clave). La vista «Marca» lo enseña todo, `vistasDelCliente` encuentra las
  plantillas y `clavesPerdidas` ya no pregunta a R2 por cada logo o foto del catálogo viejos (cada pregunta era una
  petición).
  · **Los usos de verdad, también en la galería**: `usosVivos` corre ahora para la página y la papelera juntas (UNA
  lectura de los calendarios del cliente) y cada uso trae el día, el título y el producto de su publicación (lo usan la
  búsqueda y el filtro de producto). «Usada / Sin usar» y la pila de versiones ya no premian una imagen que se cambió por
  otra. Ojo: esa lectura de los calendarios va en CADA GET /api/estudio (antes, sólo si la papelera tenía algo usado).
- **«Lo último» no es «todo»**: deja fuera la carpeta «Competencia» y lo de la marca (tienen su vista), cuenta TARJETAS
  (un carrusel, una; las versiones de una pieza, una) y va por semanas (de lunes a domingo, Panamá, por la pieza más nueva
  de cada tarjeta). La competencia se reconoce por el NOMBRE de su carpeta (`esCarpetaCompetencia`): la crea el estudio de
  mercado sin tipo.
- **Las carpetas de la aplicación no gastan las 30 de la persona** (`tipo: "auto"`, `TIPOS_VALIDOS`; `reusar` en
  `crearCarpeta`). El lote las crea con `{ tipo: "auto", reusar: true }` (el del mismo día o del mismo mes se reusa) y las
  variaciones con `{ tipo: "auto" }` (la repetida sale « (2)»). Las de antes, sin tipo, se reconocen por su nombre
  («Lote …», «Variaciones · …», «Competencia»: `esCarpetaAutomatica`) y tampoco cuentan; así la de la competencia se crea
  aunque la persona tenga ya sus 30. Van en el desplegable «Más carpetas…», no en la fila de chips. Cambiar el nombre de
  `nombreCarpetaLote` o `carpetaDeVariaciones` sin cambiar ese patrón haría que las viejas volvieran a contar.
- **Seleccionar es sobre lo que se VE** (`idsDeLaSeleccion`): la selección guarda ids de TARJETA; un carrusel o un reel
  (`grupo-<carpeta>`) son todas las piezas de su carpeta para la papelera (como «Mandar el carrusel a la papelera») y sus
  piezas EN ORDEN para «Poner en una publicación»; una pila de versiones es sólo la que se ve. Antes «Todas las que se
  ven» marcaba también lo apilado y la papelera se lo llevaba, y tocar un carrusel con la selección puesta lo ABRÍA.
  «Me gusta» y «Mover a carpeta…» en grupo saltan los carruseles (moverlos los desharía) y lo dicen.
- **La galería está en su chunk** (`EstudioGaleria.jsx`): el del Estudio pasó de 20,49 a 17,55 kB. Lo que hace con el
  compositor y el visor (referencia, animar, otra versión, abrir) le llega de Estudio.jsx por la prop `tarjeta`; el estado
  que el compositor también toca (`filtro`, `enPapelera`, `enDrive`, `perdidos`) sigue en Estudio.jsx. `ideaDelPedido` se
  mudó a src/lib/escenaDelPedido.js (kitMarca.js la reexporta): importada desde kitMarca, la galería arrastraba el kit al
  grafo de lib/estudio.js y la carga inicial crecía 36 bytes (la lista de precargas de cada `import()`).
- **La tarjeta es 4:5** (la del feed): lo vertical y lo 4:5 la llenan (`object-fit: cover`, recortado arriba y abajo; entero
  al abrirlo) y lo cuadrado y horizontal va entero (`data-forma`, `formaDe`). Las marcas son como mucho TRES y van juntas
  abajo (`insigniasDe`: en el pedido, video o versiones o carrusel, «Usada», el control); la casilla de seleccionar arriba
  a la izquierda y la papelera (o el candado de la marca) arriba a la derecha. El control ya no es un `::after` de
  `data-control`.
- **«De la galería» arranca en «Sin usar»** (de verdad: lo que ninguna publicación lleva HOY) y lo dice debajo del buscador;
  sin nada, «Ver también las usadas». Las versiones van apiladas (se pone la que se ve) y en modo `una` (portada de un
  reel) las láminas de un carrusel siguen sueltas.
- Probado en Chromium con 420 piezas subidas por la API (`wrangler dev` local): 295 tarjetas al abrir, «número 410» (no
  cargada) se encuentra, «beige» (sólo en el bloque de la marca) no, «Cargar más» llega a 414 tarjetas, tocar el carrusel
  con la selección lo marca, a 390 px sin desplazamiento lateral; el selector, igual. No se probó en un iPhone ni con la D1
  de producción.
- **La revisión del director no corría en NINGUNA pieza suelta** (hasta el 19-11-2026). `fichaDelPedido` buscaba «Pieza:»
  al principio de una línea, pero el pedido compuesto (`componerPedido`, src/lib/kitMarca.js) pone la ficha detrás de
  «Escena: », en la misma línea: devolvía "" y `controlarPieza` iba sin ficha (sin `puntajeDiseno`, sin arreglos y sin la
  corrección por debajo de `NOTA_MINIMA`) en `disenar_piezas`, el lote, «Producir el mes» y `crear_en_estudio`. Sólo los
  carruseles se revisaban (`carrusel.js` pone «Pieza:» en su línea). El test de antes pasaba con una ficha SUELTA; ahora hay
  uno con un pedido compuesto de verdad (`pedidoDePieza` + `conEscena`, src/lib/director.emocion.test.js). Al arreglarlo
  SUBE el gasto: el control con ficha razona algo más y la pieza por debajo de 8 lleva una edición (como mucho una; se
  queda sólo si `mejoro`). La agencia lo aceptó a condición de mirar los datos: si casi ninguna corrección se queda, se
  apaga la corrección automática y se deja la nota.
  · **Las de 2K tampoco se controlaban**: más de 3,6 MB (un PNG de 2K pesa de 4 a 8) daba un 413 que el encargo se tragaba.
  Ahora se mira la COPIA en JPEG de 1568 px de lado (`miniaturaDe`, el Container; sobre blanco: el JPEG no tiene alfa). Sin
  Container y grande, sigue el 413.
