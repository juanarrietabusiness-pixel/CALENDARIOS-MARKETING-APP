# Trampas conocidas · IA, el asistente y Claude (MCP)

**Qué cubre:** Qué modelo escribe cada cosa y cuánto razona, Anthropic y Meta por la misma puerta, consumo y presupuesto, caché, el asistente (bucles, conversaciones, dictado, pestañas), el conector MCP y su vista previa.

**Cuándo leerlo:** Antes de tocar `worker/lib/configIA.js`, `worker/lib/anthropic.js`, el chat, `worker/lib/mcp.js` o cualquier llamada a una IA.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- **Los modelos actuales piensan si no se les dice que no, y ese
  pensamiento se paga del mismo `max_tokens` que el texto.** (Historia:
  hoy el razonamiento va ENCENDIDO a propósito, ver la entrada siguiente.) Sonnet 5 corre
  en modo adaptativo cuando la petición no lleva `thinking`, y su
  presentación viene «omitida»: el bloque llega vacío. Una respuesta puede
  volver con `stop_reason: "max_tokens"` y **sin un solo bloque de texto**.
  Eso se veía como «la respuesta se cortó antes de completar ninguna pieza»,
  y subir el presupuesto o pedir menos publicaciones no lo arreglaba: sólo
  cambiaba cuánto razonaba. Porque escribir las fichas
  del lote es transcribir un calendario ya aprobado, no razonar. Lo fija
  `worker/rutas/ia.js` por nivel (`niveles()`) y en «calidad» lo apagaba.
- **Qué modelo y cuánto razona lo decide el ESPACIO, no el código.**
  Había tres modelos repartidos sin que se vieran: Haiku para casi todo
  el calendario —los guiones profesionales los escribía el más pequeño
  sin que nadie lo hubiera decidido—, Sonnet sin razonar para las fichas
  y Opus 5.5 fijo en el chat. Ahora TODA la IA de texto lee
  `ajustes_espacio.ia_modelo` («sonnet» por defecto, «opus» o «haiku») e
  `ia_razonamiento` («alto» por defecto), que cambia sólo el
  administrador en Equipo → Inteligencia artificial (`worker/lib/configIA.js`).
  El razonamiento va siempre encendido y se le suma su margen
  (`MARGEN_RAZONAMIENTO`) al presupuesto que pide el navegador: sin él
  vuelve la trampa de arriba. El `tier` que manda el navegador ya no
  elige nada. Imágenes y video siguen en Gemini.
- **Un id de modelo fijo es una apuesta sobre la cuenta, y se perdió.**
  Con `claude-opus-5-5` fijo, el primer «Hola» devolvió «El proveedor de
  IA devolvió un error»: la clave no tenía ese modelo y el mensaje
  genérico lo escondía (lo mismo que pasó con Gemini). Tres guardas:
  «opus» se resuelve preguntando a `/v1/models` cuál tiene la cuenta; si
  aun así la cuenta rechaza el modelo, se vuelve a Sonnet 5 y se avisa;
  y cualquier otro rechazo enseña el motivo de Anthropic
  (`mensajeDeRechazo()` en `worker/lib/anthropic.js`). Todo pasa por esa
  librería y en streaming: con razonamiento, una respuesta puede tardar
  minutos, y sin streaming la API rechaza lo que podría pasar de diez.
- **Cada llamada deja su costo en `consumo_ia`.** Es lo que enseña el
  contador del mes en Equipo. `registrarConsumo()` no puede tumbar una
  respuesta: si falla, se pierde un apunte, no el guion.
- **El asistente tiene DOS bucles, y cada herramienta vive en uno.** Las
  de servidor (búsqueda web y lectura de páginas de Anthropic; el cerebro;
  ver_calendario/tareas/ideas) las encadena el Worker sin
  volver al navegador. Las que ESCRIBEN en el calendario abierto siguen en
  el navegador, que sabe no pisar lo que la persona está editando: cuando
  el modelo pide una, el Worker cierra el turno con `resultadosServidor`
  y el navegador junta los suyos en el MISMO mensaje —la API exige todos
  los tool_result de una vuelta juntos—. Y lo que el Worker devuelve en
  `mensajes` se reenvía TAL CUAL: los bloques de razonamiento llevan
  firma, y tocados son un 400. Entre turnos no se reenvían: el historial
  guardado es texto.
- **Lo que reescribe el asistente no cuenta como corrección de la persona** (`POST /api/cerebro/<c>/texto-ia`,
  `marcarTextoDeIA`): antes de aplicar un cambio de texto de `editar_publicacion` o del lote, el chat fecha la fila de
  `cerebro_usos` de esas publicaciones como «se le pidió texto a la IA», y lo que llegue en el guardado es la nueva base.
  Sólo toca las que ya tenían fila (sin ella no hay aprendizaje). Sin esto, «reescríbeme la descripción» restaba a las
  notas que se usaron como si alguien la hubiera corregido entera.
- **Lo que el asistente hace se guarda con su respuesta.** Va plegado como
  `[[contexto: Acciones realizadas]]`: antes sólo se guardaba el texto y
  «¿qué cambiaste ayer?» no tenía respuesta. El historial ya no se corta
  en 50 mensajes: pasado el umbral, lo viejo se pliega en `chat_resumenes`
  y el modelo recibe resumen + recientes enteros.
- **Al leer la respuesta de Anthropic hay que recorrer TODOS los bloques**,
  no `content.find(b => b.type === "text")`: basta un bloque de pensamiento
  por delante para que ese `find` devuelva `undefined` y el texto llegue
  vacío sin ningún error. La función devuelve además `diagnostico`
  (`stopReason`, tokens de entrada y salida, tipos de bloque) para no tener
  que deducir a qué se fue el presupuesto.
- El asistente y los modales se anidan dentro de `.overlay`; el scroll del
  fondo lo bloquea `useDialogA11y`, no hace falta añadir nada.
- **«No puedo» de la IA casi nunca es del modelo: es que no le diste la
  herramienta.** `publishTime` existe en el modelo de datos desde el
  principio, pero no estaba en el esquema de ninguna de las herramientas
  del asistente, así que a «ponle las 9 de la mañana» contestaba que no
  podía —y era verdad—. Antes de tocar el prompt o cambiar de modelo,
  mira `getChatTools()` (src/lib/herramientasChat.js) y el contexto de `buildChatSystemPrompt()`: lo
  que no está declarado ahí no existe para la IA.
  El mismo fallo al revés: los datos SÍ estaban —descripción y guion van
  en el contexto— y aun así decía que no podía leerlos, porque la lista
  de «QUIÉN ERES» enumeraba sólo crear, editar y eliminar. Un modelo se
  ciñe a lo que le dicen que puede hacer, aunque tenga el dato delante.
- **Un filtro declarado y no implementado no falla: acierta por
  casualidad.** `editar_publicaciones_lote` declaraba `filtro_dia`,
  `filtro_formato` y `filtro_categoria`, y el ejecutor **no los leía**:
  aplicaba los cambios por `post_id` y ya. Como la IA además mandaba los
  ids correctos, el resultado salía bien y nadie lo notó. El día que
  confiara en el filtro habría editado lo que no era. Ahora la lógica
  vive en `lib/lote.js`, que es pura y tiene sus casos.
- **El asistente global vuelca TODAS las publicaciones en el prompt, y
  eso tiene fecha de caducidad.** Hoy son cuatro clientes y cabe. El
  coste se paga en CADA mensaje, aunque la pregunta sea «hola», y crece
  con la agencia: a partir de cierto punto desplaza la conversación y
  hay que cambiarlo por consultas —que la IA pida lo que necesita en vez
  de recibirlo todo—. La descripción ya se recorta a 120 caracteres para
  que quepa, que es la primera señal.
- **Lo que no es prosa en el chat viaja DENTRO del texto, como marca.**
  `chat_messages.content` es texto, así que las piezas copiables
  (`[[pieza: …]]`), las imágenes generadas (`[[imagen: clave | formato]]`)
  y el análisis de lo adjuntado (`[[contexto: …]]`) se guardan como
  marcas y `partirMensaje()` (`lib/mensajeChat.js`) las convierte en
  bloques al pintar. Las de pieza las escribe el MODELO porque se le pide
  en `INSTRUCCION_PIEZAS`: si un día salen juntas otra vez, mira el prompt
  antes que el pintado. Una clave de imagen que no cuelgue de `clientes/`
  se queda como texto: nunca llega a un `src`.
- **La API de Claude no recibe video.** El video lo ve Gemini
  (`worker/rutas/video.js`, por su Files API para no pasar decenas de
  megas a base64 dentro del Worker) y el análisis escrito se guarda en el
  mensaje del usuario, para que el hilo lo recuerde después. Los
  fotogramas los saca el navegador y sólo viajan en ese turno. Un video
  subido desde el chat se guarda antes en el banco del cliente: el
  análisis lee de R2.
- **El saldo de Anthropic se acabó sin que nadie lo viera.** El contador
  existía, al fondo de Equipo, sin tope, y sin contar ni la búsqueda web
  (10 $ por 1.000) ni lo que se paga a Google. Ahora: medidor en la
  cabecera, Ajustes con presupuesto (`presupuesto_usd`, 30 $ por defecto)
  y qué hacer al llegar (`al_limite`: avisar, bajar a Sonnet Bajo o
  detener, 402). TODA llamada de IA pasa por `prepararIA()` (texto) o
  `bloqueoPorPresupuesto()` (Gemini) antes de salir, y por
  `registrarConsumo()`/`registrarConsumoGemini()` al volver. Una ruta de
  IA nueva que se salte cualquiera de las dos gasta sin tope o sin
  apuntarlo. Lo que gaste OTRA aplicación con la misma clave no lo ve
  nadie aquí: sólo la consola de Anthropic.
- **Escribir caché que nadie lee cuesta un 25 % más.** El consumo real
  del asistente enseñó 49.000 tokens escritos en caché y 0 leídos: los
  mensajes llegaban con horas de diferencia y la caché dura cinco
  minutos. El navegador manda `seguido` (menos de 4,5 min desde la
  anterior) y el Worker sólo marca caché entonces o desde la segunda
  vuelta del bucle, que sí la lee.
- **La generación mandaba el ADN entero, sin caché, y con la maquetación
  dentro.** `docs/auditoria-conexion-adn.md` decía que el ADN iba marcado
  con `cache_control`; no iba: `cachedBlock()` existía desde la migración
  y nadie lo llamaba, así que cada tanda de seis publicaciones pagaba el
  contexto entero (~25.000 tokens en Dcasa). Además de la marca, ese ADN
  lleva la capa de MAQUETACIÓN para Meta AI (plantillas, escala, bloque de
  estilo, negativos, contrato del HTML), que escribir un caption no
  necesita: ~40 % del total en los clientes con receta. Ahora
  `buildClientContext` la quita (`sinCapaMaquetacion`) y `callAI` parte el
  contexto en «ADN» —con `cache_control`— y «lo que cambia»
  (`prepararContenidoIA`). Dos cosas para no romperlo: el título «FICHA EN
  LA APLICACIÓN» de `buildClientContext` es donde se parte, y una
  petición cuyo PRIMER bloque es una imagen no se cachea (la caché es por
  prefijo). Las dos fallan abiertas: si no reconocen la forma, mandan
  todo. Ni el asistente ve ya esa capa: el prompt maestro de Meta AI no lo lee ninguna IA (ver más abajo).
- **El saldo agotado llega como un 400 cualquiera.** «Your credit balance
  is too low…» se traduce en `mensajeDeRechazo()` a qué hacer.
- **El micrófono del asistente escucha hasta que se vuelve a pulsar** (`src/lib/dictado.js`). Estaba en
  `continuous: false` sin provisionales: cortaba en la primera pausa (3–4 s) y no enseñaba nada hasta el final. Ahora
  `continuous` + `interimResults`; si el navegador corta solo (Chrome tras un silencio, Safari más a menudo) se vuelve
  a encender mientras siga «escuchando», con tope (`MAX_REENCENDIDOS_VACIOS` cortes seguidos sin oír nada) para no
  quedarse en bucle sin permiso o sin servicio. Cada frase final entra UNA vez: cada sesión trae su lista vacía y los
  índices vistos se apuntan. «Parar» deja entrar la frase que se estaba diciendo; ENVIAR la junta con lo provisional
  y `cortar()` no deja entrar nada más (si no, una frase tardía aparecía sola en la caja vacía). Safari en el iPhone
  no se ha probado: los tests usan un SpeechRecognition de mentira.
- **«Ampliar» pone el asistente a pantalla completa** (`chat-ampliado`, se recuerda en `localStorage`): aunque esté
  acoplado pasa a ser un DIÁLOGO (tapa todo) y Escape primero lo reduce. La caja de escribir crece con el texto —también
  con el dictado, por eso es un efecto sobre `input` y no el `onChange`— hasta `ALTO_MAX_CAJA` (40 %) de la pantalla;
  en el teléfono va arriba a todo el ancho y los botones debajo. Sus estilos, en `ChatPanel.css` (va con el chunk lazy).
- **El asistente va por CONVERSACIONES, una por tema, y las ve todo el equipo** (`chat_conversaciones`, 0043;
  `worker/rutas/conversaciones.js`, `ConversacionesChat.jsx`). Había un hilo por cliente: o se arrastraba todo o se
  borraba todo, y cada mensaje pagaba el historial entero. Cosas que no se ven en la pantalla:
  · **0043 reconstruye `chat_messages` y `chat_resumenes`** (el asistente general no tiene cliente y `client_id` era NOT
  NULL); no tienen hijas. Lo de antes pasa a «Conversación anterior» con id fijo `anterior-<cliente>` y su resumen va
  con ella. Si alguna vez se reaplicara, no se pierde ningún mensaje, pero todos volverían a esa conversación.
  · **El resumen es por conversación** (`chat_resumenes.id` = la conversación; `?conversacion=` en /api/ia/chat/resumen)
  y el asistente sólo recibe el historial de la que está abierta, más el cerebro y las memorias de antes. Lo que deba
  valer en todas se guarda con «Recordar esto» (la misma tarjeta que `guardar_en_cerebro`).
  · **La conversación se crea con el PRIMER mensaje**, con las primeras palabras de título (`tituloProvisional`), y la
  IA le pone el suyo tras la primera respuesta (función «título de conversación», hueco del asistente). La nueva no se
  relee al crearla (`sinRecargar`): lo que está en pantalla ya es lo que hay.
  · **El asistente general guarda las suyas sin cliente.** `client_id = ?` no casa con un vacío, así que su lista se
  filtra en la ruta. Un colaborador no las ve (la capa no le enseña filas sin cliente) y no puede crearlas (403): el
  chat general le funciona igual, sin guardar.
  · **Cada cambio avisa** (`chat:conversaciones`): App.jsx lo pasa como evento de `window` y el panel relee su lista y,
  si es la abierta y no está esperando respuesta, sus mensajes. Así otra persona del equipo puede pedir en la misma
  conversación y se ve. La que tenía abierta cada persona se recuerda por navegador (`chat-ultima:<cliente>`).
  · Las rutas de antes (`/api/clientes/<id>/chat`) se quitaron: un mensaje guardado ahí no tendría conversación.
- **El asistente es diálogo o panel según el ancho.** Desde 1280 px se
  acopla a la derecha (`role="complementary"`, `useDialogA11y(…, {
  activo: false })`): sin foco atrapado ni fondo oscuro. Por debajo,
  diálogo como siempre.
- **El MCP vive FUERA de `/api`, y eso obliga a tocar `run_worker_first`.**
  `/mcp`, `/oauth/*` y `/.well-known/oauth-*` los fija el estándar o se
  pegan en claude.ai; sin estar en `run_worker_first` de wrangler.jsonc,
  el respaldo de la SPA contesta `index.html` con un 200 y Claude dice
  «no se pudo conectar» sin más. La pantalla de permiso, en cambio, SÍ
  es de la SPA (`/conectar-claude`): así se entra con la sesión de
  siempre, y la puerta de acceso sale sola si no la hay.
- **El token del MCP es una sesión: vive en `sesion.js` y se guarda en
  huella.** Queda atado a la persona y a SU espacio (se construye la capa
  de acceso con el `owner_id` del token), el código sirve una vez, PKCE
  S256 es obligatorio y el de renovación se rota en cada uso. Desconectar
  en Ajustes → Claude borra la fila y corta al momento.
- **Claude es el asistente, no llama al asistente.** Las consultas del MCP
  son las MISMAS funciones del asistente (`crearEjecutor`); las escrituras
  hacen lo que el PUT del calendario (resincronizar la cola y avisar al
  espacio con `calendario:recargar`), firmadas «Claude (persona)».
- **Haiku 4.5 no habla el idioma de los modelos 5.** Rechaza con un 400
  `thinking: adaptive`, `output_config.effort` y las herramientas web de
  2026; razona con `budget_tokens` (≥ 1.024 y menor que `max_tokens`) y su
  salida acaba en 64.000. Todas las rutas escriben la petición para los
  modelos 5 y **`adaptarAlModelo()` (worker/lib/anthropic.js) la traduce
  dentro de `abrirFlujo()`**, por donde pasa toda llamada: una ruta nueva no
  tiene que saberlo. En nivel Bajo, Haiku responde sin razonar.
- **Español latino neutro, en un sitio.** El modelo imita lo que tiene
  delante: con un ADN o un ejemplo con voseo escribía «vení» y «tenés».
  `REGLA_IDIOMA` (src/lib/idioma.js) va delante del sistema en
  `abrirFlujo()`, por donde pasa TODA llamada a Anthropic, y en el análisis
  de video de Gemini. Delante y fija: la caché es por prefijo. Un test
  falla si alguien llama a `/v1/messages` desde otro sitio.
- **Meta (Muse Spark) entra por la MISMA puerta que Anthropic.** Su API habla
  el formato de mensajes de Anthropic en `api.meta.ai/v1/messages`, así que
  `abrirFlujo()` decide por el id (`muse-*`) a dónde va y con qué llave
  (`META_API_KEY`, o `MODEL_API_KEY`), y `adaptarAlModelo()` le quita lo que
  puede no aceptar: `thinking`, `output_config`, las marcas de caché y las
  herramientas que ejecuta Anthropic (web). Ninguna ruta sabe de Meta.
  `esRechazoDeModelo()` trata un 401/403/404 de Meta como «ese modelo no»: la
  ruta vuelve a Sonnet y avisa —el Contributor no está en todas las regiones—.
  **Nada de Meta se ha probado contra el servicio real.**
- **Un modelo por función, y el de redacción cambia solo al poner la llave.**
  `ajustes_espacio.ia_modelos` (JSON, 0027: no `ia_modelo`, cuyo CHECK
  obligaría a reconstruir la tabla) guarda el de cada hueco —redacción,
  guiones, lectura, asistente, análisis— y el motor de imagen. Cada
  `funcion` del contador cae en un hueco (`FUNCIONES_IA`, `huecoDe()`): una
  ruta nueva tiene que pasar su `funcion` a `prepararIA()` o cae en
  «análisis». Sin elección propia y con llave de Meta, redacción y guiones
  escriben con **Muse Spark 1.2 Contributor**, que entrena con lo que recibe:
  la advertencia de Ajustes no se puede cerrar mientras lo use alguna
  función. Las notas internas no viajan a la redacción; al asistente, sí.
- **El PROMPT MAESTRO de Meta AI no lo lee NINGUNA IA** (decisión de la agencia: instrucciones viejas de otro proyecto).
  `fueraDeUso` (worker/lib/cerebro/cerebro.js) deja fuera de todos los usos —también del asistente— las notas de tipo
  `maquetacion` y las que se titulan «Prompt maestro», «Meta AI» o «Nano Banana vN» (`esDelPromptMaestro`), y
  `buildClientContext` ya no tiene `{ maquetacion }`: el ADN de antes llega siempre sin esa capa. Las notas siguen en la
  pestaña Cerebro para borrarlas. Si vuelve a aparecer «prompt maestro» en un pedido, es una regresión.
- **La VISTA PREVIA en el chat de Claude (MCP Apps): las piezas se ven DENTRO del chat, en la web y en el teléfono, como
  con Higgsfield** (`worker/lib/mcpVista/`, `worker/lib/estudio/vistaEstudio.js` y `vistaTrabajo.js`; especificación de
  MCP Apps 2026-01-26). El conector declara `resources` y sirve UN recurso `ui://juancito-ads/vista-2.html` (`resources/list`,
  `resources/read`, tipo `text/html;profile=mcp-app`); las herramientas que crean o miran piezas (`CON_VISTA`: ver_pieza,
  estado_trabajo, estado_encargo, crear_en_estudio, corregir_pieza, disenar_piezas, ver_cuadro, ver_escenas, el reel) y las
  que SUENAN o se reproducen (previsualizar_voz, generar_locucion, generar_musica, renderizar_video, ver_video) lo nombran en
  `_meta.ui.resourceUri` (y en la clave plana de antes), y claude.ai pinta esa página junto al resultado. Cosas que no se ven:
  · **Las imágenes NO van dos veces:** siguen como bloques de imagen en `content` (las mira Claude) y la vista
  (`structuredContent`, `vistaDe`/`piezaDe`) sólo dice qué pieza es cada una por su índice (`imagen`). **El texto va
  TAMBIÉN dentro de la vista** (`texto`, en `llamar` de worker/lib/mcp.js): según la especificación el modelo no lee el
  `structuredContent`, pero Claude Code se lo da al modelo EN LUGAR del texto (se vio en producción: llegaban la imagen y el
  JSON, sin el modelo, el pedido ni las instrucciones).
  · **Se pone al día sola:** con `seguir`, la página llama cada pocos segundos una herramienta SÓLO SUYA (`vista_encargo`,
  `vista_trabajo`: `_meta.ui.visibility: ["app"]`, claude.ai no se la da al modelo) con `ya` = las que ya enseña, y el
  servidor sólo manda las imágenes nuevas (seis por vuelta como mucho; si quedan, `cada: 1`). Para a las 300 vueltas o a los
  tres fallos («Actualizar»). `me_gusta_pieza` es el «Me gusta» de la galería.
  · **Lo que toca la persona no se salta la confirmación:** «Cambiar» y «Crear» del plan ESCRIBEN en el chat (`ui/message`:
  «En la pieza a2 de …: …», «Sí, créalo (vi el costo: unos …)») y Claude sigue con sus herramientas; «Abrir en el Estudio»
  es `ui/open-link` con la dirección que pone `conEnlace` (rutas/mcp.js) con el origen del conector.
  · **La página va ENTERA dentro del recurso** (el iframe de claude.ai no deja cargar nada de fuera salvo lo que declara
  `_meta.ui.csp`: sólo el origen del conector, para los audios y videos; ver abajo): navegador.js + modelo.js empaquetados
  con esbuild y estilos.css, en `pagina.generada.js`. Un test la regenera y
  compara; si se toca cualquiera de los tres, `node scripts/mcp/generar-vista.mjs`. El protocolo (JSON-RPC por
  `postMessage`: `ui/initialize`, `ui/notifications/tool-result`, `size-changed`…) va escrito a mano, sin el SDK (pesa
  418 kB): se probó contra el `AppBridge` OFICIAL de `@modelcontextprotocol/ext-apps` 2.0.3 en Chromium (el anfitrión que
  usa claude.ai): el saludo, el resultado, la vuelta con `ya`, «Me gusta», «Cambiar», el enlace, el tema oscuro y el
  ancho del teléfono. **No se ha probado en claude.ai de verdad hasta que se despliega.** Si la versión de la página cambia
  de forma, se sube el número de `URI_VISTA` (claude.ai puede guardar la de antes).
  · `herramientas.js` (la comparte el asistente de la aplicación) importa `vistaTrabajo.js` y NO `vistaEstudio.js`:
  éste lee encargos.js, que por fichas.js → mercado.js → herramientasServidor.js vuelve a herramientas.js (el ciclo deja
  `DEFINICIONES_ESTUDIO` sin iniciar). El asistente de la aplicación recibe sólo el texto cuando no hay imágenes.
  · **Los AUDIOS y VIDEOS se oyen y se ven en la vista** (vista-2; decisión de la agencia: «previsualizar las locuciones
  casi como las imágenes»). La muestra de una voz, la locución, las dos versiones de la música de Suno, el mp4 de un video
  animado (y su locución), un video del Estudio y el reel montado van como `audios`/`videos` del `structuredContent`
  (`medioDe`; worker/lib/estudio/vistaMedios.js) y la página los pinta con `<audio controls>` y `<video controls
  playsinline>`. No caben en el resultado como una imagen: van por su DIRECCIÓN FIRMADA, que también va en el texto
  (`lineasDeMedios`) para que Claude se la dé a la persona si su cliente no pinta vistas. El asistente de la aplicación
  sigue recibiendo sólo el texto (`{ texto, imagenes: [], vista }`). Lo que no se ve:
  · **La dirección es `/api/vista-medio/<testigo>/<nombre>`** (worker/rutas/vistaMedio.js, ANTES de la sesión: el iframe no
  la tiene): abre sólo la clave del testigo, sólo audio o video, sólo de `clientes/` o `voces/` (no `voces/pendientes/`), y
  caduca a las 12 h. Contesta por TROZOS (`Range` → 206, con `rangoServido` como `sirveMedia`: sin eso el iPhone no
  reproduce). No es la de Meta (`/api/medio-publico/`): ésa necesita `META_APP_SECRET`, que un espacio sin Meta no tiene, y
  no contestaba por trozos. Se firma con un secreto que SIEMPRE existe porque se crea solo: 32 bytes al azar en R2
  (`firmas/vista-medios.key`, fuera de `clientes/`: ni /api/media ni esta ruta lo sirven), leído una vez por instancia.
  · **El recurso declara el origen del conector, y nada más** (`metaDeVista(origen)` en modelo.js: `csp.resourceDomains`
  = [el origen de la petición a /mcp], `connectDomains` vacío: la página no hace `fetch`). Sin eso el anfitrión pone
  `media-src 'self' data:` y ningún audio carga (la prueba en Chromium lo comprueba: con la CSP de vista-1 sale «Abrir»).
  Por eso subió a vista-2: claude.ai puede guardar la de antes.
  · **`conEnlace` (rutas/mcp.js) pone el origen** en las direcciones (las herramientas las dan relativas: en la aplicación
  valen tal cual) y en el texto. La página sólo acepta http(s) absolutas (`direccionValida`).
  · **Un reproductor se REUTILIZA al repintar** (`reproductores` en navegador.js) y una vuelta no le cambia la dirección
  (`mediosConLosDeAntes`): cada vuelta trae otra firma, y cambiar el `src` cortaba lo que se estaba oyendo.
  · **Lo que se está haciendo se espera solo**: la locución, la muestra y la música, con `vista_trabajo` (el hueco «Se está
  generando la voz…» hasta que suena); un video animado, con `vista_video` (sólo de la vista) mientras renderiza o genera su
  voz; el reel, con `vista_encargo` (`videosDelReel`: el mp4 montado o, si no, el video o los clips).
  · **Una dirección caducada se renueva**: si el reproductor no carga y su `caduca` pasó (o no se sabe), la página llama
  `vista_medios` (sólo de la vista) con su `ref` (`archivo:<id>`, por la capa de acceso; o `muestra:<modelo>:<voz>:<huella>`,
  que tiene que existir) UNA vez; si aun así no carga, «Abrir» (`ui/open-link`) en vez de una caja rota.
  · **Sin `sandbox` en la ruta** (sí `default-src 'none'; media-src 'self'` y `nosniff`): con `sandbox`, Chromium le da al
  documento de medios (un mp4 abierto suelto, que es «Abrir») un origen opaco, su <video> pide el archivo con CORS y se
  queda vacío. Lo cazó la prueba en Chromium, no los tests.
  · Probado en Chromium con el `AppBridge` oficial de `@modelcontextprotocol/ext-apps` 2.0.3, la página servida desde otro
  origen con la CSP que arma el anfitrión según la especificación y la RUTA REAL del Worker (empaquetado con esbuild) en
  un tercer origen: el audio y el video cargan por trozos, repintar no corta lo que suena, la dirección caducada se renueva,
  «Abrir», tema oscuro y ancho del teléfono. **No se ha probado en claude.ai de verdad hasta que se despliega**, ni con un
  mp4 de producción en el iPhone.
- **El asistente flotante tiene dos pestañas: «Asistente» y «Director (diseño)»** (ChatPanel, con un cliente;
  `cambiarPestana`). Antes era un interruptor «Modo director» con un filtro «Todas / Diseño» en la lista, y no se sabía
  en cuál se estaba. Cada pestaña enseña SÓLO sus conversaciones (las del director, `tema: "diseno"`, son las mismas de la
  pestaña Diseño) y recuerda su última abierta aparte (`chat-ultima:<cliente>:diseno`). Se guardan todas en `todasConv` y
  `conversaciones` es la vista de la pestaña: la lista no se vuelve a pedir al cambiar. El sistema del asistente ya sabía
  diseñar con cliente: la pestaña cambia dónde se guarda y lo que se ve (título, encargos), no lo que sabe.
- **El asistente flotante mide lo que SE VE** (`useAltoVisible`, `visualViewport`): en el teléfono el teclado no encoge
  `innerHeight` ni un `fixed; inset: 0`, así que la caja de escribir crecía hasta el 40 % de la pantalla entera y el
  botón de enviar quedaba bajo el teclado. Ahora el panel mide el alto visible, la caja crece hasta el 30 % de eso (220 px
  como mucho) y los encargos del director se esconden mientras hay texto.
- **El asistente DENTRO de un post sólo cambia ESE post** (botón «Asistente» en la cabecera del panel; `ChatPanel` con
  `publicacionFija` y `lateral`; `src/lib/asistentePost.js`). La regla no la pone el prompt —un modelo se equivoca de
  id— sino el código: `herramientasDelPost` quita todo lo que crea, borra, mueve o edita en lote (y tareas, banco,
  memorias), y `guardaDelPost` rechaza la herramienta que nombre otra publicación y pone el `post_id` a la que lo omite.
  El calendario que ve (`calDelAsistente` en PostSidePanel) lleva el `form` abierto, y sus cambios entran en el `form`
  (`desdeElAsistente`) con «Deshacer»: si escribiera en el calendario, el guardado al desmontar el panel lo pisaría. A lo
  ancho va al lado (el panel se corre: `.con-asistente`); en el teléfono, encima. La conversación es POR PUBLICACIÓN
  (`chat-ultima:<cliente>:post-<id>`, título «Post <fecha>: …») y no se borra al salir: «Borrar conversación» (segundo
  toque). `editar_publicacion` admite además `titulo`, `hashtags` y `escena`.
- **Una vuelta del asistente que se corta se RECUPERA al volver** (teléfono bloqueado, otra pestaña: el sistema corta la
  conexión). El navegador manda `turnoId`; el Worker, que sigue hasta acabar su vuelta, guarda el final en R2
  (`turnos/<espacio>/<turno>.json`, nunca bajo `clientes/`) y `GET /api/ia/chat/turno/<id>` lo da UNA vez (lo borra al
  leerlo). `conversarIA` lo pide en diferido (`turnoChat.js`) cuando la pestaña vuelve a verse, cada 4 s, y el chat sigue:
  con herramientas del navegador, las ejecuta; si el servidor ya guardó la respuesta (`guardado`), relee la conversación.
  `esperarArchivos` (carruselEstudio.js) tampoco se rinde por un corte: espera a que la pestaña se vea (hasta 40). Lo que
  NO hace todavía: seguir con las herramientas del navegador con la aplicación cerrada (eso sería otro paso).
- **Lo que crea el director se guarda en la conversación EN CUANTO SALE** (ChatPanel, en el bucle de herramientas): antes
  iba sólo en la respuesta final, y si se cerraba el chat o se bloqueaba el teléfono a mitad del turno, las piezas
  estaban en la galería y no en el chat. Por eso el historial puede tener dos mensajes seguidos del asistente: al
  mandarlo a la IA se juntan en uno. Un plan que esperaba «Crear» cuando se cerró el chat queda como «Plan sin crear» en
  la conversación, y el director sabe que «créalo» basta. «De la galería» en el chat adjunta piezas del Estudio con su
  `archivo_id` (el asistente las puede usar de referencia, corregir o poner en un post sin volver a subirlas).
- **El chat no mueve la página** (ChatPanel): bajar al último mensaje era `scrollIntoView`, que desplaza TODOS los
  contenedores, también la página: en la pestaña Diseño el chat se subía y la caja de escribir quedaba fuera de su sitio
  hasta cambiar de pestaña. Ahora se desplaza sólo la lista (`scrollTo` de `.chat-mensajes`) y todo `focus()` del chat va
  con `preventScroll`. El formulario inicial del compositor vive en lib/estudio.js (`formularioInicial`): la pestaña
  Estudio estaba en su tope de 20 kB.
- **El micrófono del asistente necesita `microphone=(self)` en
  `Permissions-Policy`** (`public/_headers`). Con `microphone=()` Chrome ni
  siquiera pregunta y el dictado falla en la web; en el iPhone funcionaba
  porque Safari no aplica esa cabecera. Cámara y geolocalización siguen
  cerradas, y `tests/despliegue/plantillas.test.js` lo vigila.
- **La etiqueta del modelo mentía: decía «Sonnet 5» a una agencia que escribía con Muse.** `etiquetaIA` leía sólo el
  modelo general, y el general sólo admitía Anthropic (CHECK de `ia_modelo`). Ahora `modeloDeFuncion` (src/lib/configIA.js)
  aplica la MISMA regla que `modeloParaHueco` del servidor con `meta` (si hay llave de Meta, que manda GET /api/ajustes), y
  un general de Meta va en `ia_modelos.general`, que manda sobre la columna en `leerConfigIA`. «Bajar» al llegar al
  presupuesto se queda en Meta si el general es de Meta. Y faltar la llave de Anthropic ya no contesta 503 si hay la de
  Meta (`sinIADeTexto`).
- **`exportar_piezas`: el ZIP se ARMA AL DESCARGARLO, por flujo, y no se guarda** (worker/lib/exportarPiezas.js). La
  herramienta comprueba (cada ID de la galería de ESE cliente, sin papelera; hasta 60 archivos y 150 MB por la columna
  `bytes`) y devuelve `/api/exportar/<testigo>/<nombre>.zip`, firmado con el secreto de la vista (`secretoDeVista`, uso
  propio) y válido 15 minutos, sin sesión y sin límite de usos (el iPhone pide dos veces). El testigo lleva el espacio,
  el cliente y los IDs por carpeta; al abrirlo se releen las fichas por la capa de acceso y lo borrado entretanto no
  sale. Por flujo porque el Worker tiene 128 MB: un ZIP de 150 MB en memoria no cabe. Sin comprimir, con descriptor de
  datos (bit 3) y el CRC por trozos (`crc32Seguir` en src/lib/zip.js). Sin `exports/` en R2 ni regla de ciclo de vida,
  a propósito: no hay nada que limpiar. `conEnlace` le pone el origen al enlace en el texto. Nombres «01-titulo.ext»:
  el título de `ajustes`, la línea «Pieza:» de la ficha o las primeras palabras del pedido. Un paso del flujo que no
  pone nada en él no se vuelve a pedir: por eso un archivo que falta en R2 se salta dentro del mismo `pull`.
- **El MÉTODO de la agencia también por el conector de Claude: las INSTRUCCIONES lo mandan por las herramientas del
  calendario** (`METODO` en worker/rutas/mcp.js, delante de `guia_de_diseno` y de `REGLA_RECETAS`; decisión de la agencia:
  «sacarle provecho a todo lo del curso» trabajando casi siempre desde Claude). Lo del curso vive en el CÓDIGO y sólo se
  aplica si el trabajo pasa por sus motores: los textos por `escribir_textos` (escribe el calendario) o `ficha_de_textos`
  (escribe Claude con el MISMO pedido, sin gastar la IA del calendario, y lo guardado vuelve con los avisos); el mes por
  estrategia → plan → textos → revisión; los números y las campañas por sus herramientas, no por calculadoras de otros
  skills. Lo que pide `confirmado` se enseña antes a la persona. `editar_publicacion` acepta además `referencia` (el
  `referenceLink`, limpio con `enlaceLimpio`: lo pide «falta para enviar»). Un test exige que `initialize` nombre
  escribir_textos, ficha_de_textos y numeros_del_negocio.
