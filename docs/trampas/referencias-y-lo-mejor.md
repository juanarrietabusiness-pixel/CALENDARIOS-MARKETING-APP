# Trampas conocidas · Referencias, inspiración y «Lo mejor»

**Qué cubre:** El banco de ideas, Inspiración, «Lo mejor del momento», la competencia, la Biblioteca de anuncios, Scrape Creators y TikTok.

**Cuándo leerlo:** Antes de tocar `worker/lib/loMejor.js`, `inspiracion.js`, `scrapeCreators.js`, la Biblioteca o el banco de ideas.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- **«Su contenido en Instagram»: lo que publica la competencia, lo que mejor le funcionó primero**
  (`ContenidoCompetencia.jsx` en la pestaña Competencia del estudio de mercado; `worker/lib/competencia.js`,
  `src/lib/competencia.js`; `GET /api/mercado/<c>/competencia?usuario=`). `business_discovery` desde el Instagram del
  cliente o, si no tiene, cualquiera del espacio (como la auditoría): sólo cuentas de empresa o creador (409 si no). Se
  ordena por interacciones (un comentario pesa el doble) con la tasa por cada 100 seguidores; los chips son los
  `competidores` de la ficha. Las miniaturas pasan por `/api/metricas/miniatura` y la dirección del ARCHIVO no llega al
  navegador. «Analizar como referencia» = `POST …/competencia/traer` (baja el archivo del CDN de Meta —sólo de
  `cdninstagram.com`/`fbcdn.net`, ≤ 50 MB— a la galería, carpeta «Competencia», pidiendo la dirección otra vez porque
  caducan) + la referencia de siempre (`agregarReferencia`, orgánica): desde ella salen «Adaptar», «Recrear con mi marca»
  y «Seguir este video». En un reel, además, «Extraer guion UGC». **Nada se ha probado contra Meta real.**
- **Inspiración: las cuentas que sigue cada cliente y lo que publican** (`src/lib/inspiracion.js`, `worker/lib/inspiracion.js`,
  `Inspiracion.jsx`, 0046). Hasta 10 cuentas por cliente (Instagram, YouTube o TikTok; «Competencia» o «Inspiración») en
  `clients.competidores`, que eran @ sueltos: `cuentasDeReferencia` lee las dos formas sin tocar una fila, y la foto de
  Resultados mide sólo las de Instagram de competencia (`usuariosParaMetricas`). Cosas que no se ven en la pantalla:
  · **El feed se GUARDA** (`inspiracion_cuentas`, `inspiracion_publicaciones`): abrirlo no gasta llamadas. Lo pone al día el
  cron (`inspiracionPendiente`: un cliente por vuelta, cada `CADA_HORAS` (20), el último paso y sólo si la vuelta no hizo nada
  más; hasta 10 llamadas a Meta o 3 por canal de YouTube) y «Actualizar». Una cuenta que falla deja su error Y su fecha (si no,
  el cron la repetiría cada minuto) y no borra lo que ya se había leído de ella; lo de una cuenta leída bien que ya no está entre
  sus últimas, o de una cuenta que se quitó, se borra. La consulta del cron es una lectura sin dueño (`clientesConInspiracionVieja`).
  · **«Rinde X×» es contra la MEDIANA de la propia cuenta** (`conRendimiento`; con menos de 3 publicaciones, null): con la media,
  un viral dejaba a las demás por debajo. Lo nuevo (7 días) que rinde 3× o más AVISA al equipo una vez (`avisado`, tope 3 por lectura).
  · **YouTube por la Data API** con el token de un canal conectado del espacio o `YOUTUBE_API_KEY` (`canalPublicoYouTube`,
  `forHandle`); su video NO se baja (sus condiciones): el guion lo saca Gemini POR EL ENLACE (`verVideo({ youtube })`,
  `extraerUgc({ youtube })`; con Meta como motor de video, 409). **TikTok no deja ver lo de otros por su API**: va por Scrape
  Creators (ver «TikTok y las tendencias por Scrape Creators»); sin la llave, la cuenta queda con su aviso y se abre su perfil.
  · **Un enlace de Instagram sin @** (`traerEnlace`): la API no busca por enlace. Se busca en este orden y se para en el primero:
  el @ del enlace o el escrito, la memoria (`instagram_enlaces`) y el feed guardado, las cuentas fijas del cliente (una llamada
  por cuenta, y esa lectura sirve para bajarlo), la página pública de «insertar» (`/p/<código>/embed/captioned/`,
  `usuarioDelEmbed`: SÓLO el @, decisión de la agencia; el archivo va siempre por `business_discovery`) y, si nada, 409
  `codigo: "usuario"`. Lo resuelto se recuerda en cuanto se encuentra la publicación.
  · **Un reel con música de Instagram no trae `media_url`** (Meta lo omite, incluso del propio): 409 `codigo: "musica"` y se
  ofrece su miniatura (`miniatura: true`) para analizarlo con su texto, o guardarlo desde el teléfono y compartirlo.
  · **Lo de otra cuenta va como REFERENCIA, nunca en `medios`** (`post.referencias`, `referenciasPost.jsx`): lo que está en
  medios se publica. `deIdeaAPublicacion` pasa los `archivos` de una idea del banco a `referencias` —antes iban en un campo que
  la publicación no leía y el video traído se perdía— y `ideaAlCalendario` apunta su uso en la galería. «Usar como contenido»
  lo pasa a medios con una pregunta (sólo si es del cliente o hay permiso). La referencia no va al enlace del cliente.
  · Se lleva a un día ARRASTRANDO desde el panel (`inspiracionId` en el `dataTransfer`, `onDropInspiracion` de MonthGrid →
  `llevarRef` del panel) o con «Llevar a un día»; los dos bajan el archivo (sólo Instagram) y usan `ideaAlCalendario`.
  · «Lo que funciona en tu competencia» (función del mismo nombre, hueco «análisis»): la IA lee las que más rindieron (45 días) y
  escribe PATRONES sin nombrar cuentas ni marcas; NO es interna (para que el motor de ideas la lea) y no se guarda sola: «Guardar
  en el cerebro» con PUT /nota, una por mes (la del mes se reemplaza por su ruta).
  · «Fórmula» abre «Extraer guion» en modo fórmula (`formula`): sólo transcribe (`soloTranscribir`, sin la llamada de texto de
  adaptar) y propone la receta. **Nada de esto se ha probado contra Meta, Google ni Instagram reales.**
- **«Lo mejor del momento»: una galería de lo que MEJOR funciona, de cuatro fuentes, para recrearlo** (`src/lib/loMejor.js`,
  `worker/lib/loMejor.js`, `worker/rutas/loMejor.js`, `LoMejorTarjetas.jsx`, `/lo-mejor`, 0062). La pestaña Inspiración de
  cada cliente (y el ojo del calendario) es ESTA vista filtrada por él; en el teléfono ocupa el sitio de «Enlace» en la barra
  de abajo («Pegar un enlace» va dentro). Cosas que no se ven en la pantalla:
  · **Cuatro fuentes, cada una con su señal, y el orden es el PERCENTIL dentro de su fuente** (`conPercentiles`, calculado
  sobre la ventana: esta semana, este mes): «4,1×» y «63 días» no se comparan. Inspiración: «rinde» CORREGIDO con pocas
  publicaciones (`rindeAjustado`: se acerca a 1× con poca muestra; YouTube, las vistas contra las del canal); anuncios: días
  activo, más si sigue y si tiene versiones (`senalDeAnuncio`); lo propio: interacciones + guardados + compartidos contra la
  mediana de su cuenta; lo guardado por el equipo: el «rinde» que traía o lo reciente. La tarjeta enseña la cifra de verdad
  (`cifraDe`), nunca el percentil.
  · **Una pieza es UNA** (`clave`: «ig:<código>», «yt:<video>», «fb-ad:<anuncio>», «tt:<video>», o «ref:<hash>» del enlace;
  `claveDeEnlace`): la misma seguida por dos clientes y guardada en el banco sale una vez, con los clientes de todas y las
  otras fuentes en `tambien` (`unirRepetidas`). La consulta del cron (`espaciosPorClasificar` en acceso.js) arma la clave
  con la MISMA regla en SQL: si cambia `claveDeInspiracion`, cambia también ahí.
  · **El tipo lo clasifica la IA UNA vez y se guarda** (`lo_mejor_piezas`, función «clasificar lo mejor», hueco «análisis»):
  sin razonar y con el modelo del espacio para «análisis» (antes, Haiku fijo si había llave de Anthropic; `llamarIA` acepta `esfuerzo`), mirando la miniatura (del CDN o de R2) y
  el texto, de 6 en 6. Los tipos NO se limitan: lo que no encaja va como «otro» con su nombre (`etiqueta`). La pantalla pide
  clasificar lo que ve sin tipo (una vez por ventana abierta) y el cron, lo de la inspiración y los anuncios. Lo que falla
  queda apuntado con su motivo (sin `clasificada_at`): el cron no lo repite cada minuto y la pantalla lo reintenta pasadas 6 h.
  · **El cron va ÚLTIMO y sólo si nada más hizo algo** (`loMejorPendiente`, detrás de Inspiración): primero UNA tarea de la cola
  de Scrape Creators (los anuncios de un espacio, una cuenta de TikTok o una palabra de tendencia; ver «TikTok y las
  tendencias»); si no, una tanda de clasificación.
  · **Anuncios por Scrape Creators una vez por semana, con TOPE** (`lo_mejor_ajustes.sc_tope_semana`, 10 por defecto, en
  Ajustes → Integraciones; 0 la apaga): se releen las búsquedas guardadas con `fuente: "sc"` (una página por búsqueda, lo
  de la caché no gasta). CADA crédito gastado se apunta en `creditos_sc` (`apuntarCredito` en worker/lib/scrapeCreators.js),
  también lo buscado a mano: el automático se para antes. Sin créditos, el espacio se marca lleno hasta el lunes (`sc_lleno`,
  no se mira cada minuto). Instagram NO gasta créditos: sigue por la API de Meta (la inspiración).
  · **«Recrear para [cliente]» es UN recreador** (`recrear`, `RecrearLoMejor.jsx`; también lo usan las referencias del
  estudio de mercado, cuyo «Seguir este video» fijaba Kling Omni de Higgsfield —sin llave— y cuyo «Recrear con mi marca»
  mandaba la imagen de otra marca al motor). Primero el costo: sin `confirmado: true`, 409 `codigo: "confirmar"` con el
  costo, el próximo día libre (`proximoDiaLibre`, desde mañana) y el camino. Con el sí: la publicación en ese día con el
  original en `referencias` (NUNCA en `medios`) y `recreadoDe`, y según el camino: «imagen» o «carrusel», un ENCARGO del
  servidor con el director (el original va como imagen ESPECIAL `papel: "inspiracion"` en `datos.especiales` del encargo,
  que `fichasDeDiseno` mira y el motor de imagen nunca recibe); «animado», el guion de un video animado unido al post
  (`escribirGuion` + `crearProyecto`); «grabar», `extraerUgc` (paga ANTES de crear nada: si falla, no queda un post
  vacío) con `audioUgc`, qué audio usar al publicarlo (la API no lo pone). El servidor escribe el mes y avisa con
  `calendario:recargar` SIN pestaña: también la que lo pidió relee. La pieza que sale NO se pone sola en el post todavía
  (eso es de la fase 5): queda en la galería con el post apuntado.
  · **No se paga dos veces**: `bajarALaGaleria` devuelve lo ya bajado por su nombre (la cuenta y el id: un video no tiene
  huella); `agregarReferencia` devuelve la referencia ya analizada del mismo archivo o del mismo enlace (`repetida`); la
  transcripción de un video de YouTube se recuerda en `lo_mejor_piezas.datos` (por «yt:<id>»), porque no tiene ficha en la
  galería.
  · **La cifra viaja**: al banco van `cifra`, `rinde`, la miniatura y el archivo como referencia (`ideaDeLoMejor`; también
  desde la Biblioteca); «Guardar en el banco» de «Extraer guion» guarda el enlace y el video.
  · **El video se reproduce por un proxy** (`GET /api/lo-mejor/video?u=`, sólo `cdninstagram.com`/`fbcdn.net` y el CDN de TikTok, pasa el
  `Range`: sin trozos el iPhone no lo reproduce; con `sandbox` y `nosniff`). La dirección del video de un reel la guarda la
  inspiración (`inspiracion_publicaciones.video`, la `media_url` que caduca: el feed se relee cada 20 h).
  · **El aviso «rinde 3×» lleva a la TARJETA** (`/cliente/<id>/inspiracion?pieza=<clave>`): va primero y se señala.
  · **Claude**: `ver_lo_mejor` (las claves, las miniaturas como imágenes y la vista previa) y `recrear` (costo y «sí», como
  las demás); «Crear con Claude» desde una tarjeta guarda en el handoff la pieza (`referencia`: enlace, cuenta, cifra, tipo,
  por qué funciona) y el original de la galería, y `receta` se lo da a Claude.
  · **Nada de esto se ha probado contra Scrape Creators, Meta ni la IA reales**: los tests usan `fetch` de mentira.
- **TikTok y las tendencias por Scrape Creators, dentro del MISMO tope que los anuncios** (decisión de la agencia: Scrape
  Creators sólo para anuncios y para TikTok; `src/lib/scrapeCreators.js`, `worker/lib/scrapeCreators.js`,
  `worker/lib/tendencias.js`, `TendenciasTikTok.jsx`, 0068). Cosas que no se ven en la pantalla:
  · **Una cola, lo más viejo primero, una tarea por vuelta** (`tareasScPendientes` en acceso.js, `loMejorPendiente`): los
  anuncios de las búsquedas guardadas de un espacio (`sc_releido_at`), cada cuenta de TikTok de cada cliente
  (`inspiracion_cuentas.leida_sc_at`) y cada palabra de tendencia (`tendencias_palabras.leida_at`), lo que lleve una semana
  (`DIAS_SC`) o nunca se leyó. Antes de leer se mira el tope de la semana (`creditosDeLaSemana`, lunes a domingo de Panamá):
  si no cabe, el espacio queda `sc_lleno` = ese lunes y la consulta no lo vuelve a ver hasta la semana siguiente (sin eso el
  cron lo miraría cada minuto). Cambiar el tope suelta la marca. Sin la primera búsqueda intentada, los anuncios NO cuentan
  como releídos (van primero el lunes). Va detrás de todo el cron, y la clasificación de lo leído en las vueltas siguientes.
  Lo buscado a mano en la Biblioteca también suma y NO se bloquea: su respuesta trae `semana` ({ total, tope }) y la
  pantalla avisa si se pasó.
  · **Una cuenta de TikTok se lee como mucho una vez por semana** (`tiktokLeToca`). Quién la lee: el cron de «Lo mejor»
  (`tiktok: "auto"`), la primera lectura de una cuenta recién añadida (la pantalla pide las que `faltan`: también «auto», sólo
  si cabe en el tope; si no, espera y se dice) y «Actualizar» a mano (`manual`: cuenta para el tope y NO se bloquea; la
  respuesta trae `avisoSC` si se pasó). El cron de cada 20 h de Inspiración NO la lee (`no`): conserva lo leído, su fecha y
  sus publicaciones (`leidas`: sólo se borra lo de las cuentas leídas ahora). La lectura semanal de una cuenta no mueve su
  `actualizada_at`, que es lo que mira el cron de 20 h (si no, retrasaría el Instagram y el YouTube del cliente).
  · **«rinde» de TikTok va por VISTAS** contra la mediana de su cuenta (`conRendimiento(…, { campo })`,
  `campoDeRendimiento`); la tarjeta dice «rinde 36× en vistas». La clave es «tt:<video>» (`claveDeInspiracion`, igual que su
  enlace y las tendencias): la misma pieza seguida, en tendencia y guardada en el banco es UNA. La consulta del cron que
  clasifica (`espaciosPorClasificar`) arma las claves de TikTok con la misma regla.
  · **Las tendencias** son otra fuente de «Lo mejor» (`fuente: "tendencia"`, percentil por VISTAS dentro de su fuente, «1,2 M
  de vistas» con `cifraCorta`). Su fecha es la de la última búsqueda (como un anuncio: es «del momento» mientras sale en
  ella); se guardan las `POR_PALABRA` (12) con más vistas y lo que lleva 35 días sin aparecer se borra. Un #hashtag va por la
  búsqueda de hashtag; una palabra, por la de palabra clave con `date_posted: this-week` y, si la API no entiende la fecha o
  el orden (400, que no cobra), UNA vez sin ellos. Hasta 5 palabras por cliente, en su tabla (no en la ficha: `clientToRow`
  no las pisa), con `PUT /api/inspiracion/<c>/tendencias`. El interruptor del espacio (`tiktok_tendencias`, encendido) las
  saca de la cola y de «Lo mejor».
  · **El archivo de un video de TikTok** (`traerTikTok`): SIN la llave y sólo de los dominios de TikTok (`HOSTS_TIKTOK`;
  `bajarALaGaleria` acepta ahora `hosts`, `red` y `cabeceras`, y comprueba el dominio también tras una redirección), hasta
  50 MB, y lo ya bajado no se baja ni se paga otra vez (`yaBajado`, por el nombre: la cuenta y el id). Sus direcciones caducan
  en horas: si la guardada ya no vale, el detalle del video (`/v2/tiktok/video`, un crédito a mano) da otra. Si TikTok no lo
  da, 409 `codigo: "sin_archivo"` y la pantalla lo dice: se recrea con IA (el director mira la miniatura) o se guarda desde el
  teléfono. Un video de fotos de TikTok es un carrusel sin archivo. El proxy de videos de la tarjeta acepta TikTok, y si no se
  reproduce la tarjeta vuelve a la miniatura.
  · **Las rutas y la forma de la respuesta salen de la documentación pública** (`/v3/tiktok/profile/videos?handle=`,
  `/v1/tiktok/search/keyword?query=`, `/v1/tiktok/search/hashtag?hashtag=`, `/v2/tiktok/video?url=`; la respuesta «aweme» de
  la app de TikTok) y se leen con TOLERANCIA (`videoTikTok`, `videosDeRespuesta`: `aweme_list` o
  `search_item_list[].aweme_info`, `statistics` o `stats`, `url_list` o la dirección suelta). **Nada de esto se ha probado
  contra Scrape Creators real**: los tests (tests/migracion/tiktok.test.js) usan un `fetch` de mentira. Lo primero con la
  llave: leer UNA cuenta de TikTok desde «Actualizar» y mirar en `biblioteca_cache` qué contestó; si la forma es otra, se
  arregla en `videoTikTok` y nada más.
- **La Biblioteca de anuncios NO enseña la competencia comercial de
  Panamá, y la pantalla lo dice arriba.** Fuera de la UE y el Reino
  Unido, `/ads_archive` sólo devuelve anuncios de temas sociales,
  elecciones o política; lo comercial sólo sale si se entregó allí. Una
  búsqueda de «zapatos» en PA no falla: vuelve VACÍA, y eso parece «no
  tienen anuncios». Por eso `normalizarConsulta()` cambia «todos» a
  política fuera de la UE (y lo avisa), el aviso es fijo y no se puede
  cerrar, y cada búsqueda lleva el enlace a la web de la Biblioteca con
  lo mismo rellenado (`urlBibliotecaWeb()`, con sus casos). Esos
  parámetros son los de la web, no una API con contrato.
- **`ad_snapshot_url` lleva el token de quien buscó** (`…/render_ad/?id=
  …&access_token=…`), y `paging.next` también. Enseñar cualquiera de los
  dos —o meterlo en el CSV, que se manda por correo— regala el acceso a
  Meta de la agencia. El enlace de la tarjeta es `?id=<anuncio>` de la
  Biblioteca (`enlaceDelAnuncio()`), del cursor sólo viaja `after`, y los
  tests buscan el token en la respuesta entera. El CSV además antepone
  `'` a lo que empieza por `= + - @`: el texto de un anuncio es de un
  tercero y en una hoja de cálculo sería una fórmula.
- **Buscar en la Biblioteca es un GET** (`/api/biblioteca/buscar?c=<json>`):
  no cambia nada, así que quien es de sólo lectura también busca (la
  puerta corta todo lo que no es GET). Cada petición es UNA llamada a
  Meta, `limit` ≤ 50 y como mucho `MAX_PAGINAS` (10) por búsqueda; no hay
  IA ni consumo que apuntar. El error de identidad —(#10) con subcódigo
  2332002— se traduce a «Verifica tu identidad en facebook.com/ID y vuelve
  a intentar»: lo tiene que hacer quien conectó Meta, no quien busca.
- **Guardar un filtro y no verlo en la lista: el eco propio se descarta.**
  El evento `biblioteca` vuelve con la pestaña de quien guardó y App.jsx
  lo ignora (es la guarda contra el eco). La lista de filtros se relee a
  mano tras cada cambio propio; el pulso sólo trae los de los demás. Lo
  cazó abrir la pantalla, no los tests.
- **Nada de la Biblioteca se ha probado contra Meta.** Los tests hablan
  con un `fetch` de mentira que contesta como la documentación. Lo
  primero con una cuenta verificada: una búsqueda de política en PA y una
  comercial en ES (`ad_type=ALL`).
- **La Biblioteca de anuncios va por SCRAPE CREATORS cuando hay llave** (`src/lib/scrapeCreators.js`,
  `worker/lib/scrapeCreators.js`, `BibliotecaSC.jsx`, `/api/biblioteca/sc/*`, 0058). La API de Meta fuera de la UE sólo
  da política; Scrape Creators lee la Biblioteca pública entera. Arriba de /biblioteca se escoge «Todos los anuncios» o
  «API de Meta (política)» (sólo si hay llave). Cosas que no se ven:
  · **La llave vive SÓLO en el Worker** (`SCRAPECREATORS_API_KEY`, secreto), va en `x-api-key` y nunca sale: el
    navegador sólo sabe `sc: true`. `connect-src` sigue en `'self'`.
  · **Cada pedido gasta un crédito, así que hay caché** (`biblioteca_cache`, del ESPACIO: la misma competencia la miran
    varios). La misma búsqueda (ruta + parámetros ordenados, `claveDeCache`) vale `HORAS_CACHE` (12) h; las empresas,
    72 h; el detalle y la transcripción piden además la caché de Scrape Creators (`cache_max_age`). Lo que pasa de 1,5 MB
    no se guarda (D1 corta la fila a 2 MB). Otra página (cursor) es otra búsqueda y otro crédito: «Cargar más» lo dice.
  · **Errores:** 402 sin créditos, 404 sin anuncios, 400 la búsqueda, 403 de Facebook → 409; un 5xx se reintenta UNA
    vez; sin llave, 503 sin llamar a nadie. Lo fallido no entra en la caché.
  · **Las direcciones de fbcdn caducan**: «Traer a la galería» y «Analizar como referencia» bajan el archivo a R2 por
    `bajarALaGaleria` (sólo del CDN de Meta, ≤ 50 MB, carpeta «Competencia»); las miniaturas pasan por el proxy de
    siempre. «Al banco de ideas» guarda la idea con el enlace a la Biblioteca (`?id=`), no el del CDN.
  · La transcripción sólo de un video y nunca la larga (`allow_long_transcription` cobra por minuto).
  · Los filtros guardados llevan `fuente: "sc"` (`consultaSC` los valida) en la misma tabla que los de Meta.
  · **Nada de esto se ha probado contra Scrape Creators real**: los tests hablan con un `fetch` de mentira con la forma
    de su documentación. Lo primero con la llave: buscar una empresa de Panamá y mirar si sus anuncios llegan.
- **El banco de ideas es UNO para la agencia** (`banco_ideas`, 0044; `worker/rutas/bancoIdeas.js`, `src/lib/bancoIdeas.js`,
  `useBancoIdeas`, `BankPanel.jsx`, `GuardarReferencia.jsx`). Cada cliente guardaba el suyo dentro de su fila
  (`clients.ideas_bank`) y no había sitio para el video de referencia que se encuentra en el teléfono sin saber aún para
  qué empresa es. Ahora cada idea es una FILA con su cliente o sin él: sin cliente es GENERAL y sale en el banco de
  TODOS hasta que se le asigne uno. Una REFERENCIA es una idea con `referenceLink`. Cosas que no se ven en la pantalla:
  · **0044 pasa las ideas de cada cliente a la tabla con su cliente y VACÍA el JSON**: reaplicarla no resucita lo que
  se borró después. `clientToRow` ya no lleva `ideas_bank` (la columna se queda, con «[]»). La forma de la idea es la
  de siempre (`datos`), así que llevarla al calendario no cambió; `deIdeaAPublicacion` quita lo que es sólo del banco.
  · **Una idea sólo sale del banco si entró en el calendario**: `ideaAlCalendario` (App) devuelve si entró y la vista
  la quita entonces (`banco.quitar`). Antes, llevarla a un mes SIN cajón la borraba sin meterla en ningún sitio.
  · **`client_id = ?` no casa con un vacío**: la lista se lee entera (son decenas o cientos) y se filtra
  (`filtrarBanco`, vistas «De este cliente» = suyas + generales, «Generales», «Todas»). Un colaborador no ve las
  generales ni puede crearlas (403, la capa): «Guardar referencia» le obliga a escoger una de sus empresas.
  · **El enlace se LIMPIA** (`enlaceLimpio`): al compartir desde el teléfono se copia «Mira este video https://…», y
  el formulario va con `noValidate` porque `type="url"` lo rechazaba sin decir por qué (lo cazó el navegador, no los
  tests). La red y el formato salen del enlace (`plataformaDe`, `formatoPorEnlace`; un dominio que sólo se PARECE
  cuenta como «web»). TikTok y YouTube traen título, autor y miniatura por oEmbed (público, sin llave, 4 s de tope;
  si no contesta se guarda igual); la miniatura pasa por `/api/metricas/miniatura` (CSP `img-src 'self'`). Instagram
  pide token para su oEmbed: va sin título.
  · **El eco de la propia pestaña no llega por el socket**: `bancoIdeasApi` lanza `banco-ideas` en `window` tras
  añadir, quitar o asignar, para que el banco del calendario vea lo guardado desde la cabecera. Escribir el texto de
  una idea se guarda agrupado por idea (600 ms) y lo pendiente sale al desmontar.
  · **«Guardar referencia»** se abre desde la cabecera (computadora), «Enlace» en la barra del móvil, el banco y
  `abrirGuardarReferencia()` desde cualquier sitio. El asistente (`agregar_banco_ideas`, con `enlace` y sin cliente =
  general) y Claude por MCP (`anadir_idea`, `ver_banco_ideas`) escriben en la MISMA tabla.
  · **Con el ARCHIVO, desde la galería del teléfono** (Android, la app instalada): el `share_target` es POST multipart
  (`files: archivos`) y lo recibe `public/sw.js` —el ÚNICO service worker, que sólo atiende POST /compartir: sin caché
  de la app ni modo sin conexión—: guarda los archivos en la caché «compartido» y redirige a `/compartir?…&archivos=
  <id>:<n>` (`deLoCompartido`). «Guardar referencia» los lee de ahí, exige escoger la empresa, los SUBE a su galería, la
  idea del banco lleva `archivos` [{ id, src, tipo }] y la caché se vacía. Con un video, «Guardada» ofrece «Extraer guion
  y adaptar». Con un enlace de INSTAGRAM sin archivo, «Traer el video de Instagram» (`POST /api/mercado/<c>/competencia/
  enlace`): el código sale del enlace y la cuenta también si la trae; si no, 409 `codigo: "usuario"` y se pregunta el @
  (la API no busca por enlace: se busca entre las últimas 50 de esa cuenta, sólo empresa o creador). Lo registra
  main.jsx; `/sw.js` va con `max-age=0` en `_headers`. **No se ha probado en un teléfono**: lo comprobado es el POST
  simulado en Chromium.
  · **Desde «Compartir» de Instagram o TikTok, sin abrir la aplicación** (`/compartir`, `deLoCompartido` en
  lib/bancoIdeas.js): App abre «Guardar referencia» relleno y devuelve la dirección a `/` (en un efecto: en el
  inicializador del estado, StrictMode lo haría dos veces). En Android lo pone en la hoja de compartir el
  `share_target` de `public/manifest.webmanifest` (GET con `title`, `text`, `url`; hay que INSTALAR la aplicación desde
  Chrome, y para eso hacen falta los iconos de 192 y 512). En el iPhone Safari no admite `share_target`: un Atajo
  («Codificar URL» + «Abrir URL» con `…/compartir?texto=`), y el diálogo enseña los pasos y la dirección para copiar.
  Sin service worker: Chrome ya no lo exige para instalar. **Ni la instalación ni el Atajo se han probado en un
  teléfono**: lo comprobado es la dirección en Chromium.
