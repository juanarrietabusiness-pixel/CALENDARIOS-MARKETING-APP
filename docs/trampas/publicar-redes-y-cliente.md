# Trampas conocidas · Publicar, redes, aprobación y cliente final

**Qué cubre:** La cola (Instagram, Facebook, TikTok por PostPeer, YouTube), preparar las imágenes, historias, programar, la aprobación del cliente y su enlace, Drive, la Bandeja, métricas, informes y auditorías.

**Cuándo leerlo:** Antes de tocar `worker/lib/publicador.js`, `worker/lib/publico.js`, `src/pages/Aprobar.jsx`, la pestaña Publicar, Producción o Drive.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- Las aprobaciones que llegan del sondeo se vuelcan sobre `days` **sólo en
  el estado** (`onUpdateCalLocal`). Persistirlas dispararía una escritura por
  respuesta. La tabla `approvals` es la fuente de verdad y se relee al cargar.
  `subscribeApprovals` conserva su firma: devuelve con qué pararlo, y sin eso
  cambiar de calendario deja sondeos vivos acumulándose.
- **El testigo de compartición se reutiliza, nunca se regenera.** Abrir el
  enlace de un calendario que ya lo tenía devuelve el mismo: generar uno
  nuevo mataría los enlaces que el cliente ya tiene en su correo.
- **Un aviso que aparece solo cada poco deja de querer decir algo.** El
  sondeo de aprobaciones anunciaba «tu cliente acaba de responder» en
  CADA vuelta, respondiera alguien o no. Ahora compara una huella de lo
  que ya había visto y sólo habla si de verdad cambió algo.
- **`post.image` es una ruta `/api/media/…`, y el cliente final no tiene
  sesión.** La página de aprobación la reescribe a
  `/api/publico/<testigo>/media/…` (`srcPublico()`), y `mediaPermitida`
  acepta la imagen en las dos formas. El HTML exportado las incrusta
  antes de construirse (`conImagenesIncrustadas`), y lo que se manda a la
  IA pasa por `base64DeImagen()`: mandar la ruta como si fuera base64
  hace que Anthropic rechace la petición entera. Las imágenes viejas en
  `data:` siguen valiendo.
- **El calendario va al cliente COMPLETO, y lo que pide cambiar se rehace sobre la misma pieza** (`estadoDelEnvio`,
  `mensajeDeEnvio`, `instruccionDelCliente`, `corregidaTrasCambios` en lib/aprobacion.js; `calendario/cambiosCliente.jsx`).
  «Enviar a cliente» dice cuántas llevan su pieza, cuántas no (el cliente las vería como idea: «Diseñar las que
  faltan»), cuántas no tienen hora (aprobadas, no se podrían programar sin tocarlas), cuántas tienen cambios pedidos sin
  hacer y cuántas ya están corregidas. `conAprobacion` trae el comentario del cliente (`cambiosPedidos`) y cuándo lo dijo
  (`cambiosAt`) —sólo en el estado, como el resto de la respuesta— y `pedirAprobacion` los olvida. En la pestaña Subir,
  «Rehacer la imagen con lo que pidió» EDITA la misma imagen con su comentario (+ lo que añada la agencia) por
  `rehacerConComentario` (controlEstudio.js: `pedidoDeCorreccion`, Nano Banana si hay llave, el control si está
  encendido) y la sustituye en su sitio; la de antes queda en la galería. Al guardar, `marcarActualizada` hace el resto:
  el enlace del cliente la enseña «Actualizada · revísala» con lo de antes, hay un filtro «Actualizadas» y el mensaje de
  WhatsApp, tras su revisión, dice «ya hicimos los cambios… revisa sólo esas». Corregida = `actualizadaAt` posterior a
  `cambiosAt`: sin `cambiosAt` (filas de antes) cualquier cambio cuenta.
- **El perfil: comparar con referentes y piezas por plantilla.** La auditoría lee hasta tres perfiles de
  referencia por `business_discovery` (sólo empresa o creador; el que no se lee, avisa y no tumba nada) y la IA
  dice qué adaptar de ellos; propone además tres publicaciones FIJADAS y un icono por destacado (sólo de
  `ICONOS_DESTACADO`). Las portadas se DIBUJAN (`PiezasPerfil.jsx`): 1080 × 1920 con lo importante dentro del
  círculo central (`RADIO_SEGURO`), siete estilos con la paleta del kit («Con la marca» firma cada una con su logo), y el icono se toma del SVG de `Icon.jsx`
  pintado oculto en el diálogo —renderizar con `createRoot`+`flushSync` dentro de un efecto no pinta nada y la
  imagen sale vacía—. La foto de perfil lleva el logo del kit al 62 % del diámetro. Instagram no deja cambiar
  foto, biografía, destacados ni fijados por la API: «Aplicar en el perfil» deja la lista y la convierte en
  tarea del cliente (una línea por cambio, que «Convertir en tareas» puede partir).
- **Google Drive: tres trampas.** (1) Con la app de Google «en prueba»,
  el refresh token caduca a los 7 días: tiene que estar «en producción».
  Si Google lo revoca (`invalid_grant`), la fila se borra y la pantalla
  pide reconectar. (2) Una cuenta de servicio NO sirve: no tiene espacio y
  no sube a un Drive personal; entra la cuenta de la agencia por OAuth.
  (3) El Picker de Google carga scripts de Google: rompería la CSP. Todo
  pasa por `/api/drive/*`.
- **Cada id de Drive que llega del navegador se comprueba subiendo por
  sus padres hasta la carpeta del cliente** (`dentroDelCliente`). Sin
  eso, con la sesión de la agencia se leería cualquier archivo suyo.
- **Lo que se sirve desde Drive no puede ejecutarse en este origen.** Un
  `.html` o un `.svg` servido tal cual sería código con la sesión de la
  agencia: sólo imagen (sin SVG) y video van en línea, lo demás como
  descarga, y todo con `sandbox` y `nosniff`. Lo vigila
  `tests/migracion/enrutado.test.js`.
- **La imagen de Drive que va en una publicación se COPIA a R2**
  (`a-publicacion`). La página de aprobación y el HTML exportado no
  pueden leer el Drive de la agencia.
- **La vuelta del OAuth (`/api/drive/callback`) va SIN sesión**: la
  identidad viaja en el `state` firmado con HMAC y atado a la cookie
  `__Host-drive-oauth` de la pestaña que lo pidió. Sin la cookie, un
  enlace de conexión reenviado conectaría el Drive de otra persona al
  espacio de quien lo generó.
- **Instagram no deja programar por API: la hora la cumple el cron.**
  `scheduled` en `worker/index.js`, cada minuto, procesa
  `publicaciones_programadas` (`worker/lib/publicador.js`). Publicar en
  Instagram son varios pasos —contenedor, esperar a que Meta lo procese,
  publicar— y un reel no cabe en una vuelta: cada paso guarda su avance y
  la siguiente sigue. Lo que NUNCA se repite es publicar: el id que
  devuelve Meta se guarda antes que nada, y a partir de ahí un fallo deja
  la fila «publicada con aviso» en vez de reintentar (sería un duplicado
  en el perfil del cliente). Dos vueltas a la vez se evitan reservando la
  fila con su `updated_at` como condición.
- **Lo que caduca a los 60 días es el token de la PERSONA, no el de las
  páginas.** El de usuario (`integracion_meta`) sólo sirve para listar
  páginas («Actualizar cuentas»). Publicar y medir usan el token de cada
  página (`cuentas_sociales.token_cifrado`), que se pide con el de larga
  duración y por eso no vence (salvo que se cambie la contraseña, se
  quite la app o se pierda el rol en la página: entonces, reconectar).
  Decirle a la agencia que «tiene que renovar cada 60 días» es falso y
  ya se dijo una vez; la pantalla lo explica bien ahora.
- **Meta DESCARGA los medios: no se le suben.** Los de R2 están detrás de
  la sesión, así que se le da `/api/medio-publico/<testigo>/<nombre>`,
  firmado con `META_APP_SECRET`, que abre ESE archivo y caduca en tres
  días. Va antes de la sesión en `worker/index.js`, igual que la vuelta
  del OAuth (`/api/redes/meta/callback`, atada a la cookie
  `__Host-meta-oauth`). La cola necesita saber el dominio sin petición
  delante: lo guarda `integracion_meta.origen` al conectar.
- **Instagram sólo publica JPEG, y el Worker no puede convertir.** El
  panel convierte con el lienzo antes de programar
  (`prepararMediosParaMeta` en `lib/medios.js`) y de paso apunta las
  medidas, que es lo que deja comprobar la proporción del feed (4:5 a
  1.91:1) al escribir y no a la hora de salir. «Programar al aprobar»
  corre en el servidor sin navegador: si la imagen no es JPEG, lo avisa
  al equipo en vez de programar.
- **Lo que sale es lo que hay en D1, no lo que hay en pantalla.** Antes de
  programar, el panel guarda el calendario YA (sin esperar al agrupado de
  600 ms), y la cola relee la publicación del calendario antes del primer
  paso. Mover una publicación de día u hora mueve lo programado
  (`resincronizarCalendario`, en el PUT del calendario); quitarla lo
  cancela; que el cliente pida cambios, también.
- **Un campo de archivo se vacía al resetearlo, y su `files` con él.**
  `const fs = e.target.files; e.target.value = ""` dejaba `fs` vacío y la
  subida de imágenes del panel no salía nunca, sin error. Copiar la lista
  ANTES de resetear (`[...e.target.files]`).
- **Meta sólo guarda unos días de historia: los seguidores de hace un mes
  sólo existen si se apuntaron.** La foto es de AYER (el último día
  completo), desde las 6:00 de Panamá. Cada grupo de métricas se pide por
  su lado: Meta retira y renombra (`impressions` → `views`), y una
  métrica que falla deja su hueco vacío, no la foto entera. Una cuenta
  cuyo token no vale se apunta con `datos.error` para no bloquear a las
  demás, y la pantalla la salta.
- **Las miniaturas de Instagram no se pintan tal cual:** la CSP dice
  `img-src 'self'`. Pasan por `/api/metricas/miniatura`, que sólo sirve
  imágenes de `*.cdninstagram.com` y `*.fbcdn.net`. Ampliar la CSP a esos
  dominios sería abrir la puerta a cualquier imagen de Meta.
- **TikTok se publica por PostPeer, no con una app propia** (`worker/lib/postpeer.js`, `pasoTikTok` en
  `publicador.js`). La app de TikTok de la agencia nunca pasó la auditoría: en Sandbox todo caía en el BORRADOR
  del cliente o salía en «solo yo». PostPeer publica con la suya, auditada. La integración anterior (OAuth propio,
  subida por trozos, carrusel de fotos por `TIKTOK_MEDIOS_BASE`, métricas de TikTok) se QUITÓ. Lo que hay que saber:
  · **La cuenta es una fila más de `cuentas_sociales`** (red «tiktok», `externo_id` = el `accountId` de PostPeer,
  `datos.via: "postpeer"`, SIN token: la llave es una, `POSTPEER_API_KEY`). Así redes por defecto, «¿Qué sale y
  dónde?» y la cola no saben nada de PostPeer. Una fila de la app anterior (sin `via`) NO publica: `planificar()`
  y la cola lo dicen. `datos.origen` guarda el dominio para la dirección firmada del video (la cola no tiene
  petición delante).
  · **La hora la cumple el cron, con `publishNow`**, no `scheduledFor`: mover o cancelar en el calendario ya mueve
  la fila de la cola; programado DENTRO de PostPeer, habría que moverlo también allí o saldría igual.
  · **Mandar es lo único que no se repite** (gasta créditos y saldría dos veces): se apunta `carga.postpeer.enviadoAt`
  ANTES de mandar, y si no llega respuesta (o un 5xx) queda en error SIN reintento automático. Con el id guardado en
  `contenedor_id`, nunca se manda otra. «Reintentar» (una persona) suelta la guarda.
  · **Antes de gastar, `creator-info`:** si la cuenta no admite `PUBLIC_TO_EVERYONE` (privada) o el video pasa de
  `maxVideoPostDurationSec`, falla sin mandar. Por eso el panel mide la duración también para TikTok.
  · **El webhook** (`/api/webhooks/postpeer`, sin sesión) firma «timestamp.cuerpo crudo» con
  `POSTPEER_WEBHOOK_SECRET`; marca de más de 5 min, fuera; un evento repetido se descarta por su id. Sólo ADELANTA
  lo que el cron ve preguntando (`GET /posts/{id}`): sin webhook también funciona. Busca la fila con
  `colaPorPostPeer()`, la única lectura sin dueño que añade, en `acceso.js`.
  · **Lo que llega de PostPeer se lee con tolerancia** (`leerPublicacion`, `datosDe`): la documentación da los
  campos, no siempre el sobre. Si su forma real es otra, se arregla ahí y en nada más.
  · **Un 202 con `success: false` NO es un rechazo** (`rechazoEnElCuerpo`): el carrusel de fotos lo contestaba así
  mientras lo procesaba, y la cola lo daba por fallido con el texto genérico. Sólo cuenta como rechazo un `success:
  false` que no sea 202 y traiga motivo. El id se busca también en `post._id`, `post_id` y el primero de `posts`/`items`,
  y si no aparece, el error dice QUÉ campos llegaron: es lo primero que hay que leer.
  · **Video, o fotos (una o un carrusel).** Las fotos van con `cuerpoFotos`: de 1 a 32 (`fotosTikTok`; con un
  video en la publicación sale sólo el video), todas con la MISMA proporción y entre 1:2,13 y 2,13:1 —lo comprueba
  `revisarPublicacion` con las medidas que apunta `prepararParaRedes` (`medirImagen`)—, el título es la primera
  línea cortada a 90 (`tituloTikTok`) y la descripción el texto de TikTok (4.000), con música automática. Antes de
  gastar un crédito se comprueba que cada foto siga en R2. Desde el 24-nov TikTok SÍ se marca solo en una
  publicación de fotos (ver la entrada «TikTok, siempre marcado» al final). Portada de video tampoco va (PostPeer no la recibe). **Nada se ha
  probado contra PostPeer real**; los tests hablan con un `fetch` de mentira.
- **Las cifras del informe NO las escribe la IA.** Las calcula
  `src/lib/resultados.js` —el mismo código que la pestaña Resultados— y
  se CONGELAN en `informes.contenido`; la IA sólo escribe el análisis con
  esas cifras delante y la orden de no inventar ninguna. Si el informe y
  la pantalla dicen números distintos, alguien calculó por su cuenta.
  Regenerar conserva el testigo: el enlace que el cliente ya tiene sigue
  valiendo. El automático sale del día 1 al 5, desde las 9:00, después de
  la cola y de las fotos (ver `scheduled`).
- **La impresión general oculta todo `<header>` y los `.overlay`**
  (`index.css`, para imprimir un calendario). El informe tiene portada en
  un `<header>` y la vista previa de la agencia vive en un diálogo: sin
  las excepciones de `InformeVista.css`, el PDF salía sin portada, o en
  blanco desde la vista previa.
- **YouTube es una red más, por cliente, y su migración reconstruye CUATRO
  tablas.** `red` tenía `check (red in ('instagram','facebook','tiktok'))`
  en `cuentas_sociales` y en `publicaciones_programadas`, y un CHECK no se
  cambia: hay que reconstruir (0022). Pero `cuentas_sociales` tiene hijas, y
  `drop table` hace un `delete` implícito que DISPARA sus cascadas: soltarla
  tal cual borraba toda `metricas_cuenta` y `metricas_publicacion` y dejaba
  la cola sin cuenta. `defer_foreign_keys` no lo evita (aplaza la
  comprobación, no las acciones). 0028 crea las cuatro en `_v2` con las
  hijas apuntando ya a la madre nueva, suelta las viejas hijas primero y la
  madre después, y renombra (SQLite reescribe las claves ajenas al
  renombrar). `tests/migracion/youtube.test.js` siembra las cuatro, la aplica
  dos veces y comprueba que no se pierde nada y que la cascada sigue viva.
  **Otra red con CHECK nuevo tiene que hacer lo mismo** (o quitar el CHECK).
  Lo demás de YouTube (todo en `worker/lib/youtube.js` y el `pasoYouTube` de
  `publicador.js`):
  · **Mismo proyecto de Google que Drive, otro permiso por cliente.** El
  `state` y el enlace del cliente van firmados con `GOOGLE_CLIENT_SECRET`
  pero con usos propios (un `state` de Drive no abre una vuelta de YouTube),
  y SIN `include_granted_scopes`: si entra la cuenta de la agencia, el token
  del canal no debe arrastrar su Drive. Si llegan varios canales, ninguno se
  asigna solo (`datos.elegirPara`); comparten permiso (`datos.permiso`) y
  desconectar uno no revoca el de los otros.
  · **La sesión de subida se guarda ANTES de mandar un byte** (`contenedor_id`).
  Una sesión sin terminar no crea video, así que reanudarla es seguro y
  abrir otra también; lo peligroso sería abrir otra cuando la primera SÍ
  terminó y se perdió la respuesta. Por eso tras un fallo a medias se
  PREGUNTA a Google (`bytes */total`) en vez de reenviar: si ya tenía todo,
  devuelve el video. Lo que manda es el `Range` del 308, no la cuenta propia.
  · **Un trozo por paso, cuatro por vuelta del cron** (`TROZOS_POR_VUELTA`, 16
  MiB cada uno, múltiplo de 256 KiB como exige Google): cada trozo es una
  petición de salida y el plan gratuito da 50 por invocación para todo.
  · **Short = reel o historia, vertical y de hasta 60 s.** La forma y la
  duración las mide el NAVEGADOR al programar (`medirVideos` en
  `lib/medios.js`, va en `medios[].duracion`); sin medir, un reel cuenta como
  Short. Se le añade `#Shorts` a la descripción si no lo lleva.
  · **Sin auditar, Google deja PRIVADO todo lo subido por la API.** Ajustes lo
  dice siempre, y la fila publicada avisa si la privacidad que devolvió
  YouTube no es la pedida. La portada (`thumbnails.set`) va después del id y
  si falla (canal sin verificar) sólo deja aviso.
  · **«¿Qué sale y dónde?» sólo enseña YouTube si el cliente tiene canal**
  (o ya venía marcada); `resumenDestino` tampoco lo nombra en «No sale en…».
  · **Las métricas:** Analytics tarda dos o tres días en cerrar un día, así
  que un día sin filas queda en blanco (no ceros). Los videos se leen por la
  lista de subidas (`playlistItems` + `videos`), no por `search`, que gasta
  cien veces más cupo. Las miniaturas pasan por el proxy (`ytimg.com`).
  · **Nada de esto se ha probado contra Google:** los tests usan un `fetch`
  de mentira que contesta como su documentación.
- **Historias automáticas: lo ya publicado vuelve como historia, una al día por cliente** (decisión de la agencia: la
  cuenta no se queda callada entre publicaciones; `src/lib/historiasAuto.js`, `worker/lib/historiasAuto.js`, 0048,
  «Historias automáticas» en Programación). Cosas que no se ven:
  · **La imagen la hace el NAVEGADOR** (`historiasRepost.js`: la del post entera sobre ella misma difuminada, y una frase
  corta en una placa, fuera del 14 % de arriba y el 20 % de abajo; JPEG). El Worker no tiene lienzo. Se preparan solas a
  los 20 s de abrir la aplicación (una vez por sesión, `prepararEnSegundoPlano`, módulo en diferido) y con «Preparar
  ahora». El servidor sólo acepta una imagen de ESE cliente que esté en R2 y una fila de la cola PUBLICADA de verdad.
  · **Una pieza por publicación** (`clave_post` = «calendario|publicación»): salió en Instagram y Facebook y es una.
  · **«Que no salga» APARTA, no borra** (`excluida`, 0050): borrada, la publicación volvía a estar «sin historia hecha» y
  la aplicación la preparaba otra vez al abrirse, así que volvía a salir. Apartada no se prepara ni sale; «Que vuelva a
  salir» (`POST …/piezas/<id>/volver`) la devuelve. Volver a subirla conserva `excluida`.
  · **El cron pone UNA al día** (`historiasAutomaticasPendiente`, antes del Estudio: con el Estudio ocupado horas no
  saldría ninguna; sin nada que hacer, una consulta). La de hoy si a su hora le quedan 10 minutos; si no, la de mañana
  (`proximaFecha`, hora de Panamá). Sale la menos usada; a igualdad, la de más interacciones en Instagram
  (`metricas_publicacion` por `externo_id`); nunca lo publicado hace menos de 2 días ni lo que salió hace menos de 4.
  Sin nada que pueda salir, `ultima_fecha` se pone igual y `nota` lo dice: si no, el cliente se leería cada minuto.
  · **Va a la cola de siempre SIN calendario** (`calendar_id` null, `post_id` «repost-<pieza>-<fecha>», variante
  historia, la publicación en la carga con `historiaTambien` y `historias`): la cola no la relee de ningún mes,
  `resincronizarCalendario` no la toca y Programación la enseña sin «Abrir». Se quita como cualquier fila.
  `avisarFallo` toma el título de la carga cuando no hay calendario.
  · **Nada de esto se ha probado contra Meta real**: la cola es la de siempre y los tests hablan con un `fetch` de mentira.
- **Una publicación puede salir DOS veces por red: el post y su
  historia.** Cada salida es una fila de la cola con su `variante`
  (`post` | `historia`); `piezasDe()` dice cuáles tocan y
  `publicacionDeVariante()` convierte el post en la historia (sus medios
  son `post.historias`). Al reprogramar, lo que ya salió o está saliendo
  se SALTA en vez de fallar: si no, añadir la historia a un post ya
  publicado obligaría a borrar la fila publicada.
- **Las historias «con IA» COMPLEMENTAN el post, no lo encogen** (`VARIANTES_HISTORIA`, `construirPromptHistoria`,
  `informacionDelPost` en worker/rutas/imagen.js; `historiasPost.jsx`). Salían tres veces la misma imagen adaptada a
  9:16. Ahora son tres piezas distintas con la MISMA información —una pregunta, un beneficio o detalle y el llamado a la
  acción—: viajan título, producto, texto de la pieza, idea y descripción, el bloque de marca del kit, y la imagen del
  post va «de referencia del producto y del estilo, no de base», con la orden de no inventar precios. «Otras 3 con IA»
  añade una tanda nueva sin borrar las de antes. Los ids viejos (`adaptacion`, `anuncio`, `detalle`) se leen por
  `HISTORIA_ANTIGUA`. «Usar la imagen del post» sigue siendo la del post encajada tal cual. **Ese camino
  (`/api/generar-imagen` con `historiaDe`) quedó de respaldo:** la pantalla las crea ahora por el Estudio
  (`historiasEstudio.js`, ver «Las 3 historias del post salían con faltas», más abajo).
- **Una tanda de historias sale una a una, y nunca se repite una.** El
  avance vive en `carga.tanda` (`i`, `ids`); una tanda que falla a medias
  queda «publicada» con cuántas faltaron. Mismo principio que
  `externo_id`: publicar es lo único que no se reintenta.
- **La imagen de Flow (3:4) no se recorta: se ADAPTA una copia.**
  `post.adaptados["feed|<src>"]` (o `"historia|<src>"`) es la copia 4:5 o
  9:16 que sale en esa red; el original lo siguen viendo Facebook, el
  cliente y la página de aprobación. La hace el NAVEGADOR al programar
  (`prepararParaRedes` en `lib/medios.js`): el Worker no puede tocar
  imágenes, así que el servidor, sin copia, sigue dando error.
  `revisarPublicacion(…, { navegador: true })` convierte ese error en aviso
  para el panel; sin la opción, la regla es la estricta.
- **El panel de una publicación se carga aparte** (`lazy` en
  `CalendarView.jsx`, con su `publicar.css`). El JS principal estaba en
  107,6 kB de un tope de 110 y el CSS inicial en 10,5 de 12: lo que sólo
  usa el panel no va al arranque.
- **Programar una y programar muchas son LA MISMA regla.** `programar()` y
  `programarLote()` (worker/lib/publicador.js) llaman a `planificar()`,
  que no toca la base: se le da leído lo común (cuentas, Meta, la cola del
  calendario) y devuelve qué crear y qué sustituir. Uno a uno, «Programar
  lo aprobado» de un mes de veinte publicaciones pasaba de las 50
  consultas por invocación del plan gratuito; en lote son cuatro lecturas
  y un `guardarVarios`. Un caso lo vigila contando los `prepare()`.
- **Lo que falla en la cola no se puede perder en un aviso.** El cron
  publica sin nadie delante, así que el aviso del momento se va si nadie
  miraba. Lo que no salió se queda en tres sitios hasta que se reintenta o
  se descarta: el número rojo de «Programación» en la navegación
  (`?fallidas=1`, una lectura corta porque se repite con cada `pulso`),
  el bloque de Mi día y el primer bloque de /programacion, con el motivo.
- **El panel de una publicación tiene dos pestañas sobre el MISMO `form`.**
  Contenido planifica; Publicar (`calendario/seccionPublicar.jsx`) va en el
  orden en que se publica: redes, medios (arrastrar, pegar con Ctrl+V,
  reordenar), vista previa, texto, revisión y una barra fija con la hora y
  los botones. Cambiar de pestaña no guarda ni pierde nada: el guardado
  sigue siendo al desmontar el panel.
- **La vista previa pasa cada imagen por el mismo lienzo que el
  programado** (`vistaAjuste`, `calendario/vistaRed.jsx`). Si enseñara el
  original, volvería a mentir sobre lo que Instagram corta: ése era el
  fallo de la vista previa anterior.
- **Cada problema lleva su arreglo, pero la regla sigue siendo una.**
  `revisarPublicacion()` devuelve además `arreglos` (por texto del
  problema: `{ codigo, etiqueta }`) y `aplicarArreglo()` lo aplica; los
  dos son puros y tienen sus casos. Un arreglo sólo toca lo que dice
  —quitar una red, mover los hashtags al comentario, recortar a 30—, y
  «quitar la red» no se ofrece si es la única: no arreglaría nada.
- **La hora sugerida no sale con pocos datos** (`horaSugerida()` en
  `lib/resultados.js`): dos publicaciones ese día de la semana en la
  misma franja, o cuatro en la franja contando toda la semana. Con menos,
  nada: una sugerencia sacada de una publicación es ruido con aspecto de
  consejo.
- **Una auditoría de un PROSPECTO se lee con la cuenta de otro.**
  `business_discovery` pide una cuenta de Instagram conectada del espacio
  desde la que mirar, y sólo lee cuentas de empresa o creador. Una
  personal devuelve un error de Meta que no dice eso («Invalid user id»):
  `leerPerfil()` lo traduce y ofrece las capturas, que es además lo único
  que enseña los destacados (la API no los da nunca). `client_id` puede
  ir vacío: un prospecto no es cliente.
- **La IA juzga la rejilla MIRÁNDOLA.** La foto de perfil y las nueve
  últimas publicaciones van como imágenes (bajadas del CDN de Meta en el
  Worker, nunca como URL en el texto). Las cifras las calcula
  `cifrasPerfil()` y lo propuesto pasa por `limpiarAnalisis()`, que tira
  la biografía que pase de 150 caracteres: una que no entra en Instagram
  no sirve para copiar y pegar. La foto se guarda incrustada porque el
  enlace público no tiene sesión para pasar por el proxy de miniaturas.
- **Lo marcado «a mano» no sale solo.** `post.asistida` es para lo que la
  API no deja (música de Instagram, stickers, encuestas): `planificar()`
  lo rechaza, así que no se cuela ni por «Programar lo aprobado», ni al
  aprobar, ni desde el MCP. Sale en Mi día y en Programación, y
  `/a-mano/…` da el archivo para guardar o compartir con Instagram y el
  texto para copiar.
- **Publicar es UNA pregunta: «¿Cuándo sale?».** Programar, publicar ya
  y «la publico yo» eran tres controles que parecían cosas distintas, y
  el día no se podía cambiar desde ahí. `calendario/cuandoSale.jsx` pone
  un solo botón que dice lo que va a pasar («Programar para sáb 10 oct,
  9:00 a. m.»). Programar para OTRO día MUEVE la publicación
  (`moverEnCalendario`, lib/subir.js); a otro mes no, que es otro
  calendario. Una vez en la cola, el selector se cambia por la tarjeta
  «Programada para… · Cambiar · Cancelar»: así no quedan botones que
  inviten a programar dos veces. Las pestañas del panel son «Idea» y
  «Subir».
- **La IA lee el contenido, y sólo RELLENA.** «Escribir a partir del
  contenido» (`escribirDesdeContenido` en api.js) manda las imágenes y,
  de un video, el análisis de Gemini más cuatro fotogramas: la API de
  Claude no recibe video. `rellenarDesdeContenido()` escribe sólo en los
  campos vacíos; lo escrito a mano gana. En el panel el aviso se calcula
  con lo de ahora y el cambio se aplica con `setForm(p => …)`: se pudo
  seguir escribiendo mientras la IA miraba.
- **Lo subido con «Subir» sale DIRECTO: queda aprobado** (`subidaRapida`),
  sin pasar por el cliente —decisión de la agencia—. El diálogo crea la
  publicación en su día y el calendario del mes si no existe, y guarda el
  calendario por su cuenta. Dos cosas que lo hacen funcionar: el eco de la
  propia pestaña se ignora, así que App lo mete en el estado
  (`calendarioGuardado`); y ANTES de guardar suelta el guardado agrupado
  pendiente de ese calendario (`soltarPendiente`): lo pendiente ya va
  dentro —sale del estado—, y si saliera después, borraría la
  publicación nueva.
- **«Agregar publicación» ya no pide nada: pregunta.** «Subir contenido»
  (aprobada, sale directo, el formato sigue al archivo hasta que se escoja
  uno) o «Agregar idea» (pendiente, para el cliente), y abre el panel en
  esa pestaña. Como se crea vacía, el panel la DESCARTA si se cierra sin
  nada dentro (`publicacionVacia`). El descarte va en diferido y
  comprobando que el panel no se volvió a montar: StrictMode desmonta y
  monta cada efecto en desarrollo, y sin esa guarda la publicación nueva
  desaparecía nada más abrirse.
- **El panel de una publicación es una ventana ancha desde 1024 px.** En
  Subir, configurar a la izquierda y la vista previa a la derecha; en
  Idea, lo que se escribe y lo que se habla con el cliente. La barra de
  «¿Cuándo sale?» sólo es fija a lo ancho: en el teléfono tapaba más de
  media pantalla y va al final.
- **«Programar lo aprobado» prepara CADA publicación por su lado** (`programarAprobadasDe`; `programarLote` en el
  servidor igual): antes, una sola imagen que no se podía leer lanzaba y el lote entero se iba sin programar nada —el
  botón se ponía gris y volvía— mientras una a una, desde su panel, sí salían. La que falla vuelve en `fallidas` con su
  motivo. En Programación el mensaje va ARRIBA, junto al botón: abajo del todo no se veía.
- **«Programar al aprobar» es del CLIENTE** (`clients.programar_al_aprobar`, 0052; el de `calendars.opciones` de antes se
  sigue leyendo). No funcionaba ni encendido: el servidor no puede convertir a JPEG ni hacer la copia 4:5, y las piezas
  del Estudio son PNG. Ahora, al abrir «Enviar al cliente» con el interruptor encendido, el navegador prepara las piezas
  en segundo plano (`prepararEnvioDelMes`, lib/prepararEnvio.js; `conPreparadas` sólo pone lo preparado en las
  publicaciones cuyos archivos no cambiaron mientras tanto). Y si al aprobar no se puede programar, el motivo va a la
  CAMPANA (`avisar`), no sólo al aviso del momento, que se perdía si nadie tenía la aplicación abierta.
  **Si nadie abrió el envío, lo prepara el CONTAINER al aprobar** (`prepararYGuardar` en worker/lib/redesServidor.js,
  desde `programarAlAprobar`): la misma regla como plan (src/lib/prepararRedes.js: normalizar —JPEG a 2160 y medidas— y
  luego las copias 4:5/9:16 de Meta y la 1080p de TikTok) y el MISMO dibujo que el navegador (src/lib/encajarLienzo.js,
  que usa también `encajar` de medios.js) por `POST /imagen-redes`. Lo nuevo va a `clientes/<c>/posts/` y se guarda con
  el `updated_at` del calendario como condición y sólo si los archivos de la publicación no cambiaron mientras se
  preparaba; las pantallas abiertas releen (`calendario:recargar`). Sin Container (en local) o si falla, se programa
  como antes y el aviso de la campana añade «Al prepararla: …». La duración de los videos (Shorts, TikTok) sigue
  midiéndola sólo el navegador: sin medir, la cola hace lo de siempre.
- **Lo aprobado NO sale solo: espera el paso final.** El cliente aprueba
  a veces sólo la IDEA y a veces la PIEZA FINAL; cada publicación dice cuál
  se le pide (`post.aprobacion`, sin elegir: pieza si hay archivo; la «idea»
  con archivo sólo si la escogió una persona, ver la entrada siguiente) y la
  respuesta guarda qué aprobó y con qué texto (`approvals.tipo`, `huella`,
  0019). Idea aprobada = «por producir»: nunca se programa. Pieza aprobada
  = «por programar»: espera en Programación → «Aprobadas, por programar»
  (y en Mi día) a que alguien la revise y pulse Programar. «Programar al
  aprobar» sigue, APAGADO por defecto, y aun encendido sólo con piezas.
  Lo subido con «Subir» sigue saliendo directo.
- **La marca «idea» del sistema se iba con la publicación, y el «sí» del cliente quedaba «por producir» para siempre**
  (Feria del Lente, 5-nov: 12 de 25 aprobadas con `approvals.tipo = "idea"` y su imagen puesta). Nacían como ideas del
  lote («Sólo las ideas al calendario», `publicacionDePieza`) o como copia repetida (`copiaRepetida`) con `aprobacion:
  "idea"`, recibían después su pieza (el servidor, el panel, «Diseñar las aprobadas», el chat) y `tipoAprobacion`
  respetaba la marca: el cliente veía la imagen con «Idea para aprobar», su «sí» se guardaba como idea y nunca se
  programaba. Lo que no se ve:
  · **La regla vive en UN sitio** (`aprobacionQueSePide` en src/lib/publicacion.js; `tipoAprobacion` de
  lib/aprobacion.js es ella, y `publicacionParaCliente` la usa para el enlace sin importar en círculo): «pieza» puesta,
  pieza; «idea» con archivo SÓLO si la escogió una PERSONA (`post.aprobacionElegida`, que ponen `elegirAprobacion` —«¿Qué
  aprueba el cliente?»— y `pedirAprobacion`); si no, pieza si hay archivo e idea si no. Así vale por TODOS los caminos por
  los que llega una pieza (`postConPiezas`, `resultadoEnPost.js`, el panel, ProducirMes, el lote) sin acordarse en cada
  uno. La aprobación (`enviarAprobacion`) y «Programar al aprobar» ya leen «pieza».
  · **El lote y la copia repetida ya no ponen la marca** (sin archivos ya es «idea»), y la copia tampoco hereda lo que se
  escogió para la original. Las publicaciones de antes con la marca y archivo pasan solas a pedir la PIEZA; una «idea»
  escogida a mano antes de esto (sin `aprobacionElegida`) también: no se distinguen, y se aceptó así.
  · **Lo ya respondido no se reescribe solo** (la agencia: «lo arreglo yo a mano»). El aviso del panel (`EstadoAprobacion`,
  `ideaAprobadaConPieza`) y Producción → «Ideas aprobadas, por producir» ofrecen «El cliente vio la pieza: contarla como
  aprobada»: `PATCH /api/calendarios/<id>/aprobaciones/<post>` `{ tipo: "pieza" }` (worker/rutas/datos.js, por la capa)
  reescribe `approvals.tipo`, la `huella` con la publicación de AHORA y `updated_at` (si no, todo archivo puesto tras el
  «sí» saldría como «cambiaste los archivos después de que el cliente la aprobara»), apunta el historial y difunde
  `aprobacion` con `motivo: "pieza"`. Lo comprueba `motivoParaNoContar`: un «sí» vigente, con archivo y sin publicar
  (409 si no). NO programa nada, ni con «Programar al aprobar»: queda «por programar». El eco propio de `aprobacion`
  sube el `pulso` (App.jsx): la pestaña que lo pulsó relee las aprobaciones y el sondeo no lo anuncia luego como «tu
  cliente acaba de responder».
  · En worker/rutas/datos.js el tipo de la fila y de la respuesta va en una constante (`PIEZA`): tests/despliegue/
  tiempo-real.test.js toma cada «tipo» con texto literal de ese archivo por un evento de tiempo real.
- **El `status` de `days` no es la verdad de la aprobación.** Se pone al
  día al abrir ESE calendario (en el estado). Todo lo que mira varios
  calendarios —Programación, Mi día, el tablero— lee las filas de
  `approvals` (`/api/publicar/aprobadas`, `/api/aprobaciones`) y las aplica
  con `conAprobacion()`. Pedir otra vez la aprobación (`pideAprobacionDesde`)
  invalida lo que el cliente respondió antes: si no, al recargar volvería
  a salir aprobada.
- **«Cambiaste … después de que el cliente la aprobara».** El texto se
  compara por huella; los ARCHIVOS no, porque al programar se convierten a
  JPEG y cambian de ruta sin que nadie los toque: para ellos está
  `mediosCambiadosAt`, que sólo escribe el editor de medios del panel.
- **Revisión interna por cliente** (`clients.revision_interna`): el enlace
  del cliente sólo enseña lo que está en «Con el cliente» (o ya
  respondido) — `visibleParaCliente()`. Encenderla esconde todo lo
  pendiente sin etapa: es a propósito.
- **Reconectar Meta no borra el aviso de la última medición.** Los avisos
  de Resultados salen de la FOTO guardada (`metricas_cuenta.datos.avisos`),
  y reconectar no vuelve a medir: sigue saliendo hasta «Actualizar ahora»
  o la foto del día siguiente. Por eso al conectar (y con «Actualizar
  cuentas») se guarda lo que Meta concedió DE VERDAD
  (`integracion_meta.permisos`, `/me/permissions`): Ajustes dice qué falta
  y Resultados distingue «el token ya lo tiene, vuelve a medir» de «sigue
  sin él». Con `META_CONFIG_ID` los permisos salen de la CONFIGURACIÓN del
  inicio de sesión para empresas, no de `PERMISOS_META` ni de lo que se
  active en la app.
- **A Drive, un archivo de más de 90 MB va por R2** (`subirADrive` en db.js, `DRIVE_DE_UNA_VEZ`; ruta `POST
  /api/drive/clientes/<c>/desde-media`): se sube por trozos a `clientes/<c>/subidas/`, el Worker lo pasa a Drive por
  flujo (sin cargarlo entero) y lo borra de R2. De una vez, el cuerpo de una petición no pasa de 100 MB y la pantalla
  decía «el máximo es 100 MB». Lo usan la pestaña Contenido y los videos adjuntos del chat (que, sin Drive, también van
  por trozos). Que la IA VEA un video sigue con su tope de 80 MB: pasado de ahí, el chat y «Subir» trabajan con
  fotogramas.
- **La imagen generada con IA en 4:5 / 9:16 REEMPLAZA a la original en la publicación** (`reemplazarMedio`, en su
  mismo sitio del carrusel; `ajusteImagen.jsx`). Antes iba aparte, en `post.adaptados`: la lámina seguía enseñando la de
  la medida mala y la agencia no podía dejar el carrusel listo. Y al programar, la conversión a JPEG cambia la ruta de la
  imagen: las copias de `adaptados` (difuminado, color, las de antes hechas con IA) ahora la siguen
  (`renombrarAdaptados` en `prepararParaRedes`); antes se quedaban colgando de la ruta vieja y salía difuminada.
- **La vista previa enseña el ORIGINAL si ya cabe** (`vistaAjuste`): sólo lo que necesita ajuste se dibuja, y a su tamaño
  de salida (1080 de ancho, JPEG 0,9). Antes todo iba a 360 px y calidad 0,75: en retina, Instagram borroso y Facebook
  nítido.
- **«Ampliar con IA» es un ajuste más, pero no se hace solo.** Es el cuarto
  valor de `ajusteIG` («ia»), y su copia va en `post.adaptados` como las
  demás. A diferencia de difuminado/color/recorte, `prepararParaRedes()` NO
  la pide al programar —cuesta dinero—: sin copia, esa imagen sale
  difuminada. Gemini entrega el 4:5 en 896×1152 (0,78), por debajo de lo
  que admite Instagram (0,8): `ampliarConIA()` recorta al tamaño exacto en
  el navegador y borra el bruto de R2. En un carrusel cada imagen que no
  cabe tiene su fila (cómo queda, con qué modelo, «Generar» / «Otra vez»
  sólo para ella): antes se enseñaba la primera y el botón las rehacía
  todas. El motor se escoge para esa vez (`adaptarDe.motor`: «meta» o
  «google»; vacío, el del espacio) y la respuesta trae `modelo`, que queda
  en la copia de `post.adaptados`. Cada copia se pone en cuanto sale: si
  la siguiente falla, la anterior no se pierde.
- **A lo ancho, el panel de «Subir» no desplaza entero.** Cada columna
  desplaza por su cuenta (la izquierda con la barra de «¿Cuándo sale?»
  pegada debajo; la derecha, la vista previa) y el pie del panel se funde
  en esa barra (`acciones` → `inicio` de `CuandoSale`). Con la barra pegada
  al fondo de TODO el panel, tapaba media vista previa; con dos barras
  apiladas, a 800 px de alto quedaba una rendija para configurar.
- **La portada del video se guarda dos veces**: como imagen (`portada`,
  `cover_url` de Instagram y `poster` de la página de aprobación) y como
  milisegundo (`portadaMs`: `thumb_offset` de Instagram si no hay imagen). A
  TikTok no va: PostPeer no recibe portada.
- **Una imagen en un reel es su PORTADA, no un archivo más** (`postConPiezas` en src/lib/galeriaPura.js; `esReelConVideo`,
  `conPortada`, `imagenDelReelAPortada` y `portadaPorConvertir` en src/lib/publicacion.js). Claude diseñó seis portadas 9:16
  y las puso con `poner_en_publicacion`: cada reel quedó con `medios: [video, imagen]` y `portada: null`, salió sin portada
  y uno como un carrusel. Un reel de Instagram es UN video. Cosas que no se ven:
  · **La regla es UNA** (`postConPiezas`, con `como`), y la usan el chat (`poner_en_publicacion` y lo que pone
  `disenar_piezas`/`generar_imagen` con `post_id`), el MCP, «Poner en una publicación…» del Estudio (POST
  /api/estudio/<c>/poner con `como`) y lo que el servidor pone solo (`ponerResultados` de encargos.js). «Sale como reel con
  su video» = formato reel con un video, o un post con UN solo video (Instagram lo publica como reel); un carrusel, una
  historia o un directo, no. A uno así, UNA imagen va a `portada` (sin `portadaMs` ni encuadre), en «añadir» y en
  «reemplazar» (no le quita el video); varias son un error que lo dice (`REEL_SIN_IMAGENES`) y la publicación no cambia (en
  lo que se pone solo, el aviso queda en `puestos`). `como: "portada"` lo pide explícito (una imagen; si el post no la lleva,
  error); `como: "medio"` es lo que escogió una persona (un carrusel mixto en un post con un video), pero un formato «reel»
  nunca se queda con su video y una imagen al lado.
  · **Una historia NO lleva portada** (la API no la admite en las historias): una imagen en una historia con video sale como
  otra historia, como siempre.
  · **El video que llega DESPUÉS** (`conVideoEnPost` en resultadoEnPost.js: el reel del encargo, el render): si el reel
  tenía UNA imagen esperando y no tenía portada, pasa a su portada (la de Claude gana al primer fotograma).
  · **La red de seguridad**: `revisarPublicacion` da ERROR (también en el panel, y por eso no se programa ni sale de la
  cola) si un reel que va a Instagram tiene imágenes además de su video: con una, el arreglo «Usar la imagen como portada»
  (`portada-reel`); con varias, «Publicarlo como carrusel». TikTok, Facebook y YouTube siguen con su aviso de que publican
  sólo el video. Mejor que no salga a que salga mal.
  · **La portada va en JPEG a Instagram** (`cover_url` no lee otra; las piezas del Estudio son PNG o WEBP):
  `portadaPorConvertir` la pide en `prepararParaRedes` (navegador, al programar) y en `normalizacionesDe`/`conNormalizadas`
  (el Container, «Programar al aprobar»); `conPreparadas` y `prepararYGuardar` la escriben (y la cuentan en su huella). Sin
  Container ni pantalla, una portada PNG sigue saliendo como antes (es un aviso, no un error): no se ha probado qué hace
  Meta con ella.
  · **«De la galería» en «Portada del video»** abre `GaleriaSelector` con `una` y pasa el archivo a `onPortada(cambios,
  { archivo })` para apuntar su uso (en «Subir», al guardar). «Corregir» una portada desde el chat la cambia en su sitio.
  **Nada de esto se ha probado contra Meta real**: los tests usan la cola de siempre con un `fetch` de mentira.
- **Mover de día lo programado: el servidor reprograma, y la pestaña que lo movió lo tiene que RELEER.**
  `resincronizarCalendario` (en el PUT del calendario) ya cambiaba `programada_para`, pero su aviso
  `publicacion` vuelve con la pestaña de quien movió y el filtro del eco lo descartaba: la tarjeta y el chip seguían
  con la fecha vieja y parecía que no se había movido. El eco propio de `publicacion` sube el `pulso` (sin aviso).
  Arrastrar lo que ya salió o está saliendo no se deja, y a un momento que ya pasó pregunta (saldría en el minuto).
- **La Bandeja: lo que llega de Meta sin sesión, y de quién es.**
  (`worker/lib/bandeja/`, `worker/rutas/bandeja.js`, migración 0029.)
  · **El webhook se firma sobre el CUERPO CRUDO.** `X-Hub-Signature-256` es
  el HMAC-SHA256 de los BYTES que llegaron con `META_APP_SECRET`; Meta
  escapa los no ASCII («\u00bf»), así que `JSON.stringify(JSON.parse(…))`
  da otra cadena y otra firma: se lee `arrayBuffer()` y se firma eso. La
  comparación va con `igualSeguro`. Sin firma, con otra o con el cuerpo
  tocado: 403 y no se lee nada. Va ANTES de la sesión en `worker/index.js`.
  · **De quién es un aviso lo dice la CUENTA, no el aviso.** `entry.id`
  (página o Instagram) se busca en `cuentas_sociales` con
  `cuentasPorExterno()` —la única lectura sin dueño, en `acceso.js` como
  `colaPendiente`— y sólo cuentas CON cliente; luego todo va por
  `crearAcceso(db, owner_id)`. La misma página puede estar en dos espacios:
  cada uno recibe su copia, si su cliente tiene la bandeja encendida.
  · **El interruptor es la verdad** (`bandeja_clientes.activa`). Apagado,
  el webhook descarta, «Actualizar» no pregunta a Meta y las listas y el
  número de pendientes no lo enseñan. Lo guardado antes de apagar se queda
  en D1 (no se ve); apagar también da de baja la página en Meta.
  · **Un comentario es UNA fila** (`espacio:red:id de Meta`), llegue por el
  webhook, por «Actualizar» o como «edited»: se funde con lo que había y
  lo de la agencia (atendido, respondido) no lo pisa Meta. Lo propio (la
  página o la cuenta respondiendo) nace atendido. `remove` borra la fila;
  `hide`/`unhide` sólo cambian `oculto`.
  · **La ventana de 24 horas se comprueba en el SERVIDOR**
  (`ventanaMensajes()` de `src/lib/bandejaVista.js`, la misma que pinta la
  pantalla). Cuenta desde `ultimo_usuario_at` —el último mensaje DE LA
  PERSONA—, no desde el último del hilo: una respuesta de la agencia no
  reabre nada. Fuera de plazo, 409 sin llamar a Meta.
  · **Los permisos con revisión de Meta no van en `PERMISOS_META`.**
  `pages_manage_metadata` (sin él no hay `subscribed_apps` ni avisos),
  `pages_manage_engagement`, `pages_messaging` e
  `instagram_manage_messages` se piden aparte con
  `/api/redes/meta/conectar?para=bandeja` (`PERMISOS_EXTRA_META`), que con
  inicio de sesión para empresas usa SU configuración
  (`META_CONFIG_ID_BANDEJA`, con todos los permisos: el token nuevo
  sustituye al anterior). La vuelta del OAuth regresa a `/bandeja`.
  · **«Actualizar» cabe en cuatro llamadas**: las publicaciones traen sus
  comentarios por expansión de campos y las conversaciones sus mensajes;
  una por cuenta y tipo. El webhook completa miniaturas y nombres con tope
  (`TOPE_CONSULTAS_AVISO`) y primero mira lo que ya hay en D1. No está en
  el cron: no le hace falta.
  · **Nada de esto se ha probado contra Meta.** `tests/migracion/bandeja.test.js`
  habla con un `fetch` de mentira con la forma de la documentación (Graph
  v23, webhooks de Page e Instagram). Lo primero con la app de verdad:
  verificar el webhook, encender un cliente y comentar desde otra cuenta.
- **Las redes por defecto son TODAS las del cliente.** Una publicación sin
  `redes` elegidas salía sólo en Instagram (o Instagram y Facebook), y el
  TikTok conectado del cliente se quedaba fuera sin que nadie lo decidiera.
  `redesDe()` / `redesPorDefecto()` (lib/publicacion.js) dan las conectadas
  que pueden llevarla —YouTube sólo video; ni TikTok ni YouTube, historias ni
  directos; TikTok, también fotos (desde el 24-nov)—, y es la MISMA regla en el panel, «Subir», «Programar lo
  aprobado» y `planificar()` del servidor.
- **«Ampliar» a 4:5 con Nano Banana hacía zoom.** Pedirle que ampliara la
  imagen la redibujaba más cerca. Ahora se le pide una imagen NUEVA en la
  proporción de destino, con la original de referencia y un plano igual o
  más abierto (`construirPromptAdaptar`, worker/rutas/imagen.js).
- **Guardar en Drive, por mes y semana** (`planDrive` en lib/drive.js, `POST /api/drive/clientes/<id>/guardar`):
  `Octubre 2026 / Semana 2 / Martes 6 - Semana 2 - 8 am.jpg`, un carrusel con « - 1», « - 2» y las historias con
  « - historia 1». La semana es la FILA de la rejilla. Tres puertas, la misma regla: el botón de cada publicación
  (pestaña Subir), «Guardar el mes en Drive» (menú del calendario) y la casilla al programar (panel y «Subir»). Lo que
  la sustituyó, «Publicaciones de la app» con `copiasDrive`, ya no existe.
  · **Lo guardado se apunta en la publicación** (`guardadoDrive`: src → { id, ruta }). No se sube dos veces; si la
  pieza cambió de archivo, de día o de hora, se sube la nueva y la copia vieja va a la PAPELERA de Drive sólo si la
  nueva subió (`reemplaza`). Lo de archivos que la publicación ya no tiene, también a la papelera. Lo que vino de
  Drive (`clientes/<id>/drive/…`) SÍ se guarda: el mes ordenado es lo que la agencia quiere tener.
  · **Todo id que llega del navegador se comprueba dentro de la carpeta del cliente** (`dentroDelCliente`) antes de
  mandarlo a la papelera: `guardadoDrive` viaja en el JSON del calendario y lo puede escribir cualquiera del equipo.
  · **Por tandas:** cuatro piezas y tres papeleras por petición (`MAX_GUARDAR_DRIVE`, `MAX_QUITAR_DRIVE`): subir son
  dos llamadas a Google y comprobar + papelera hasta cuatro; con las carpetas y el token caben en las 50.
  · «Guardar el mes» apunta lo guardado en TODAS las publicaciones de una vez al terminar (como «Producir el mes»):
  una a una partiría cada vez del calendario de antes. Por eso no se puede cerrar mientras guarda.
  · **Nada de esto se ha probado contra Google:** los tests usan un `fetch` de mentira.
- **La cola de publicación también la lleva la bomba del espacio** (`colaDelEspacio` en acceso.js, `bombear` en
  worker/lib/estudio/bomba.js, `despertar` en `procesarPublicacion`). Con sólo el cron (una vuelta por minuto, tres filas),
  cada espera de Meta (el contenedor de un reel o de un carrusel, 20 s) costaba un minuto entero y una publicación con
  feed, historias y TikTok tardaba varios: parecía colgada y se volvía a publicar a mano. Ahora, tras una espera corta
  (≤ 5 min), `procesarPublicacion` despierta a la bomba, que mira la cola PRIMERO (cuenta como paso caro) y se queda
  despierta hasta la hora de lo que sale pronto (`COLA_DESPIERTA_MS`). La reserva de cada fila (su `updated_at`) evita que
  el cron y la bomba den el mismo paso. Lo de más lejos lo sigue llevando el cron.
- **Las fotos de TikTok salen por su copia de 1080p** (`src/lib/fotosTikTok.js`, `adaptados["tiktok|<src>"]`, la cola la
  manda en `pasoTikTok`). Un carrusel de D'CASA falló con `picture_size_check_failed`: lo más probable, las fotos en 2K del
  Estudio (TikTok también lee sólo JPEG o WebP). El navegador hace la copia al programar, como la de Instagram; va en
  diferido porque medios.js está en la carga inicial y ésta está en su tope (180 kB): por eso `capturaReducida` se fue a
  `lib/capturas.js`. **No se ha probado contra TikTok real**: el límite de 1080p es el de su documentación de fotos.
- **`ver_cola` (asistente y MCP) enseña lo que FALLÓ y después se canceló** (reprogramado, quitado del calendario,
  publicado por otro camino), con su motivo, de la última semana. El motivo siempre se guardaba, pero nada lo enseñaba: «tuve
  que publicarla dos veces» no tenía explicación.
- **Leer un video en el navegador tiene plazo** (`esperar` en lib/medios.js, 12 s). Safari en el iPhone no carga un
  video que no está en pantalla, así que `loadeddata` no llegaba nunca: «Subir» esperaba a la IA, que esperaba a los
  fotogramas, y «Publicar ahora» se quedaba gris para siempre sin decir por qué. Ahora el botón dice su motivo al lado
  y hay «No esperar a la IA».
- **La espera de TikTok tiene plazo** (`PLAZO_TIKTOK_MS`, 30 min en
  `seguirPostPeer`): sin él, un estado que no terminaba dejaba la fila en
  «Publicando…» para siempre. Al vencer queda en error con el último estado y
  NO se reintenta (ya se mandó: otra serían dos publicaciones y dos créditos).
  El aviso viaja con el evento: si TikTok la dejó con otra privacidad, lo dice.
- **El cuadro del perfil de un reel NO se elige por la API**: Instagram saca
  siempre la ventana 3:4 del CENTRO de la portada. «Encuadre en el perfil»
  (PortadaVideo) mueve la imagen dentro de la portada para que lo elegido
  quede en el centro y rellena el hueco desenfocado (`ventanaCuadricula`,
  `encuadrarParaCuadricula` en lib/medios.js); el hueco sólo se ve en la
  pestaña de reels.
- **Lo que llega de Drive se mide** (`medirImagen`): entraba sin ancho ni alto
  y entonces no salía el aviso de «no cabe en el feed» ni la opción de 4:5 —la
  misma imagen avisaba subida desde el PC y no desde Drive—. Las de antes se
  miden al abrir el panel. Y tocar una imagen o un video de la carpeta abre
  `VisorDrive` (anterior/siguiente con flechas, teclado o deslizando); antes
  se abría en otra pestaña y el video no se reproducía.
- **El informe mensual lleva las redes que se escojan** (`clients.informe_redes`, 0054; src/lib/informeRedes.js). Sin
  nada guardado, todas, como antes. Al generar se escogen (y «Anuncios»); con «Recordar» se guarda en el cliente y lo usa
  el automático del día 1. Lo de las demás redes no entra en NINGUNA cifra (`cifrasDelMes(…, seleccion)` filtra cuentas,
  fotos y publicaciones), y sin anuncios ni se pregunta a Meta. La selección va en `contenido.seleccion`, NO dentro de
  `cifras` (eso lo lee la IA). La columna no la escribe `clientToRow`: una ficha abierta desde antes no la pisa.
- **Programación es como Meta Business Suite** (`pestanasProgramacion` en src/lib/cola.js): tres pestañas —Publicadas,
  Programadas, No publicadas— con filtros de texto, cliente, red, formato y días (7/30/90 de lo publicado; lo programado y
  lo fallido, entero). Lo publicado lleva alcance, visualizaciones e interacciones: `GET /api/publicar?todo=1&dias=` (hasta
  90) las une de `metricas_publicacion` por red + `externo_id`; lo que no se midió va con «—». Al entrar, si algo falló se
  abre «No publicadas» (ahí van también «Aprobadas, por programar» y lo de a mano). En Programadas: «Publicar ahora» (sólo
  admin: el servidor da 403) y quitar de la cola, también varias marcadas. Lo publicado en Instagram NO se borra por API.
  La tabla es tabla desde 720 px; por debajo, tarjetas con la etiqueta de cada celda (`data-etiqueta`).
- **«Aplicar en el perfil» se guarda en la AUDITORÍA, no en el navegador** (`auditorias.aplicado` y `optimizado_at`, 0057;
  `itemsParaAplicar`, `limpiarAplicado`, `progresoAplicado`, `comprobarEnPerfil` en src/lib/auditoria.js). Antes iba en
  `localStorage` de cada uno: lo que marcaba una persona no lo veía otra. Cada cambio guarda quién y cuándo (`PATCH
  /api/auditorias/<id>/aplicado`, sólo claves que la auditoría pide). «Comprobar en Instagram» (`POST …/comprobar`) relee
  el perfil con `leerPerfil` y marca SOLO el nombre y la biografía si ya son lo propuesto (sin mayúsculas ni espacios de
  más) y el enlace si cambió; nunca desmarca. La foto no se puede comparar (su dirección del CDN cambia en cada lectura) y
  destacados y fijados la API no los da: se marcan a mano. «Marcar perfil optimizado» (`POST …/optimizado`) se ve en la
  lista y en el enlace del cliente (`optimizado`, sin la lista interna). Las portadas tienen un séptimo estilo, «Con la
  marca»: el icono y el logo del kit debajo, dentro del círculo seguro.
- **Historias automáticas: de 1 a 5 al día** (`historias_auto.por_dia`, 0055; `horasDelDia`, `elegirPiezas` en
  src/lib/historiasAuto.js): la primera a su hora y las demás cada 2 horas; si la última pasaría de las 22:00 se juntan (no
  menos de 30 min). Cada una es una publicación DISTINTA con la misma regla de siempre; si no hay bastantes, pone las que
  hay y la nota dice cuántas faltaron. Cambiar «cuántas al día» no reinicia `ultima_fecha` (pondría otra tanda hoy).
- **«Ver el mes como se verá»: revisar MIRANDO y programar lo listo sin la aprobación del cliente** (decisión de la agencia:
  «hay clientes que no me piden revisión… y cuando reviso no le pongo "revisado"»; `src/lib/vistaMes.js`,
  `calendario/VistaMes.jsx`, lazy). Botón «Ver el mes» en la barra del calendario, «Ver y programar lo listo» en la barra de
  publicar y su bloque en «Revisar y enviar» del asistente del mes. Cosas que no se ven:
  · **«Listo» no es «aprobado»** (`estadoParaProgramar`): pieza, hora (`publishTime` escrita: sin ella la cola pondría las
  9:00 sin que nadie lo decidiera), texto si su formato lo lleva (una historia no), alguna red conectada y sin errores de
  `revisarPublicacion` para ESAS redes con `navegador: true` (el JPEG y la copia 4:5 los hace el navegador al programar). No
  cuenta lo publicado, lo que ya está en la cola (`programada`/`procesando`/`publicada`; lo que FALLÓ sí se puede volver a
  meter), «La publico yo» (`asistida`) ni los directos: van aparte, contados, no como «no listo». Lo que el cliente pidió
  cambiar (`rejected`) NO está listo. Lo pendiente con el cliente sí: si luego pide cambios, sale solo de la cola
  (`cancelarPendientes` en la aprobación pública) y la confirmación lo dice.
  · **El servidor no exigía aprobación**: `planificar()`/`programarLote` nunca miraron `status`, así que no hizo falta otra
  puerta: el botón va por `programarAprobadasDe` (prepara cada una por su lado, guarda y `POST /api/publicar/lote`) igual que
  «Programar lo aprobado». Sólo lectura lo corta `worker/index.js` (403) y la pantalla no enseña el botón. Dos casos en
  tests/migracion/publicar.test.js lo vigilan.
  · **La cuadrícula es la de HOY del perfil: 3:4 del centro** (lo que saca Instagram; `ventanaCuadricula`), con lo del mes
  arriba (lo más nuevo primero), sólo lo que sale en el FEED de Instagram (`entraEnLaCuadricula`) y debajo lo ya publicado
  ANTES del mes (`yaPublicadasEnInstagram`, de las métricas del cron, por `/api/metricas/miniatura`: la CSP no deja pintar el
  CDN). Lo publicado DURANTE el mes por fuera de la aplicación no sale: no se distingue de una del mes publicada a mano. De
  un reel, su portada (ya encuadrada) o el video en `portadaMs`; de una imagen, la copia del feed si la hay, y si no cabe en
  el feed, el MISMO ajuste del lienzo (`useAjustada`, que salió de vistaRed.jsx a hooks/useAjustada.js: un .jsx que exporta
  algo más que su componente da un aviso de oxlint). La foto de perfil es la de la cuenta conectada (por el proxy; si no
  carga, el logo).
  · **Tocar un aviso y volver**: `abrirDesdeLista(postId, volver)` de CalendarView guarda `volver` (vista, filtro,
  publicación) en el `sidePanel`, y `cerrarPanel` (el fondo y el botón de cerrar del panel) reabre la vista con eso. Quitar o
  mover la publicación desde el panel no vuelve (el `sidePanel` se va con su `volver`).
  · **En el feed las flechas pasan de publicación** salvo dentro de lo que las usa (campos, video, la barra de pestañas), y
  deslizar pasa de publicación salvo DENTRO de un carrusel (`[data-carrusel]`), que ahora se desliza con el dedo en
  vistaRed.jsx (también en el panel). El texto de Instagram abre entero con «más».
  · **El enlace del cliente** («Tu perfil» → «Así se verá tu perfil», pages/Aprobar.jsx) usa la MISMA `cuadriculaDelMes`
  sobre lo que el servidor ya le deja ver (`visibleParaCliente`), con `srcPublico`; sin lo ya publicado (su proxy pide
  sesión). Antes eran 4:5, con las historias fuera pero con lo que iba sólo a otras redes dentro, y el video en vez de la
  portada de los reels.
  · **Los estilos de la vista previa de cada red salieron de publicar.css a vistaRed.css** (con su componente): la vista del
  mes no carga los 36 kB del panel.
- **Historias automáticas NUEVAS de lo publicado, no la misma cada vez** (decisión de la agencia: «me gustan, pero son muy
  repetitivas»; src/lib/historiasAuto.js, src/lib/historiasRepost.js, sin migración). Cada publicación da varios DISEÑOS
  (`estilosDePost`), todos gratis y dibujados en el navegador: «encajada» (la de siempre, con su placa blanca), «detalle»
  (la imagen a sangre acercada con el título), «cita» (una frase DEL CAPTION, `fraseDelPost`, sin hashtags ni emojis, en el
  color de la marca —`colorDeMarca` del kit, lo manda el servidor con los pendientes— con la imagen chica) y, en un carrusel,
  «lamina» (otra lámina encajada). La primera conserva su `clave_post` de antes («calendario|post»); las demás llevan
  «#estilo» detrás (`claveDeEstilo`): el `unique (client_id, clave_post)` sigue valiendo. Al escoger, cuenta la PUBLICACIÓN
  (`postDe`): si un estilo de un post salió hace poco ningún otro sale, un día nunca saca dos del mismo post y, de un post,
  sale el estilo menos usado. Las frases de la lista son 14 y se escogen por un número estable de la clave.
- **Las historias automáticas sólo sacan lo que SIGUE VIGENTE** (decisión de la agencia, 12-nov: en noviembre salían
  historias que decían «octubre», promociones del mes pasado y «Feliz día de la patria»; «eso no puede pasar, por nada
  del mundo»; `src/lib/vigenciaHistorias.js`, `historias_auto_piezas.vigencia`, 0077). Cosas que no se ven:
  · **Sin revisar NO sale** (`estaVigente`): las piezas de antes de 0077 quedaron «sin_revisar» y no sale ninguna hasta que
  se revisa. Vigencias: «siempre», «hasta» (`vigente_hasta`, inclusive) y «nunca»; todas las piezas (estilos) de una
  publicación comparten la suya (`aplicarVigencia`, por `baseDeClave`).
  · **Las REGLAS primero, gratis** (`vigenciaPorReglas`): una felicitación de un día o la publicación de un día especial del
  cliente que lo nombra → «nunca»; una promoción (descuento, 2x1, código del mes…) → hasta el fin del mes en que se
  publicó; un mes, una fecha, un evento (Navidad, Black Friday, la patria) o «esta semana» → hasta esa fecha (con fechas
  explícitas, la última que nombra; lo relativo acota). Lo que ya no sirve ni se prepara (`pendientesDePreparar`) ni pasa
  por la IA. «100 % algodón» no es una promoción (el % sólo cuenta con «descuento», «off» o «menos»).
  · **La IA MIRA la historia ya dibujada** (`revisarVigencias`, sin razonar y con el modelo del espacio para «análisis» —ya no Haiku fijo—, función
  «vigencia de historias», hueco «análisis»; 4 publicaciones por llamada): el texto dentro del diseño no está en ningún
  campo. Gana lo más RESTRICTIVO de reglas e IA (`combinarVigencia`). Si falla, la pieza sigue «sin revisar» (no sale) con
  `revision_error`, y el cron no la reintenta solo hasta 6 h después (`revision_intento_at`); «Revisar vigencia» sí.
  · **Cuándo se revisa**: al programar el día de un cliente (antes de escoger) y, en una vuelta sin nada que programar, UN
  cliente con piezas sin revisar (`historiasPorRevisar` en acceso.js: una consulta).
  · **Tres barreras**: escoger sólo lo vigente PARA ESE DÍA (`programarHistoriaDelDia`), quitar de la cola lo ya puesto que
  dejó de servir (`cancelarVencidas`, no lo «sin revisar»: aún puede revisarse a tiempo) y, al ir a publicar, la cola lo
  vuelve a mirar (publicador.js: un repost sin calendario cuya pieza no está vigente hoy se cancela con el motivo).
  · **Una persona manda** (`PUT …/piezas/<id>/vigencia`, «Sí puede salir» / «Ya no sirve» en Programación): `vigencia_por`
  «persona» y la revisión ya no la toca.

- **«Programar lo aprobado» lo hace el SERVIDOR, y la pantalla sólo lo sigue** (`worker/lib/programarServidor.js`,
  `src/lib/programarAprobadas.js`, `programar_lotes`, 0081). Antes la pantalla preparaba las imágenes una tras otra y guardaba
  al final: si se cerraba la pestaña no quedaba nada. Lo que no se ve:
  · **Un lote es una fila con `pendientes`, `hechas` y `fallidas`**; cada paso hace UNA publicación (`prepararYGuardar` en el
  Container + `programar`) y guarda el avance. `bloqueado_hasta` es el permiso de un paso a la vez (4 min: arrancar el
  Container y varias imágenes). Si el Worker muere a mitad, la publicación sigue en `pendientes` y se repite: `programar`
  sustituye lo programado antes de la misma pieza, así que repetir no la duplica.
  · **Quién lo avanza:** la bomba del espacio (`bombear` en worker/lib/estudio/bomba.js, después de la cola y antes de los
  trabajos; varios pasos del mismo lote por vuelta), el cron de respaldo (`encargosDelCron` → `loteDelCron`, por
  `lotesProgramarPendientes` en acceso.js) y la pantalla que lo sigue: `GET /api/publicar/lotes/:id` da ella el paso si
  lleva quieto más de `EMPUJAR_TRAS_MS` (20 s).
  · **Una publicación no va en dos lotes vivos del mismo mes** (`crearLoteProgramar` las salta): dos pasos a la vez sobre la
  misma la meterían dos veces en la cola.
  · **La pantalla guarda el mes ANTES de pedirlo** y al terminar RELEE el mes (`mesDeCalendario`) para devolverlo: el
  servidor cambió las imágenes (JPEG, copias), y si la pantalla se quedara con las de antes, el siguiente guardado
  devolvería las PNG al mes.
  · **Sin Container** la pantalla sigue por el camino de antes (prepara en el navegador). Dos formas de saberlo: sin el
  binding `VIDEO` (los tests) la ruta contesta 409 `sin_container`; con el binding pero sin Container de verdad (`wrangler
  dev`: `enable_containers: false`, el objeto contesta 503) el lote de la PANTALLA (origen «agencia») se cierra en su primer
  paso con `sinContainer` (nota «sin_container», sin aviso) y la pantalla lo lee y prepara ella. Lo de Claude y de
  «Programar al aprobar» no tiene pantalla: sigue y cada una queda con su motivo. Un 503 del Container de verdad (un fallo
  pasajero) también cuenta como «sin Container»: la pantalla lo hace por su cuenta, que funciona. El camino de antes guarda
  el mes dos veces (una para preguntar, otra con lo preparado).
  · **Lo que NO hace el servidor:** medir la duración de los videos (Shorts, TikTok); sin medir, la cola hace lo de
  siempre, como «Programar al aprobar».
  · Al cerrarse, a quien lo pidió le llega a la campana lo que no entró (o el «Listo» si tardó más de 3 min); lo de
  «Programar al aprobar» avisa sólo lo que no entró, a quien lleva cada publicación o a todo el equipo.
- **Claude programa como la aplicación** (`programar_publicacion` → `prepararYProgramar`; `programar_lo_aprobado` → un
  lote del servidor que avanza ~20 s dentro de la respuesta y sigue solo). Antes una pieza del Estudio (PNG) no salía en
  Instagram por MCP («programa desde el panel»). Sin Container, `programar_lo_aprobado` usa `programarLote` como antes y
  `programar_publicacion` dice por qué no se pudo preparar. **Nada se ha probado contra Meta ni el Container reales.**
- **Lo que respondió el cliente vive en `approvals`, no en `days.status`** (el enlace público sólo escribe `approvals`; el
  `status` del mes se pone al día cuando alguien abre ese mes en la pantalla). Todo lo que mira fuera del calendario
  abierto aplica las filas con `diasConRespuestas` (src/lib/aprobacion.js): `ver_calendario` (dice además «la IDEA» y lo
  que pidió el cliente), `programar_lo_aprobado`, el informe mensual (`cifrasDelMes`, «aprobadas»), el Inicio y el resumen
  del cliente (`resumenCalendario(cal, respuestas)` con `aprobacionesDelEspacio`, lo mismo que lee Producción).
- **«Aprobar todas» es UNA petición, todas o ninguna** (`POST /api/publico/<t>/aprobaciones`, `enviarAprobaciones`, un lote
  de D1; worker/lib/aprobarTodas.js). Antes la página mandaba una por publicación en serie y decía «Aprobamos todas» aunque
  fallara una. Con «Programar al aprobar» encendido, las PIEZAS aprobadas van a un lote del servidor
  (`programarAlAprobarVarias`): preparar 25 no cabe en los 30 s de `ctx.waitUntil`.
- **Los avisos de lo que responde el cliente se JUNTAN por mes** (`avisarRespuestaCliente` en worker/lib/equipo.js). Lo
  aprobado actualiza el aviso SIN LEER de ese mes de cada persona (tipo «aprobada», enlace al mes) si se abrió hace menos de
  `VENTANA_RESPUESTAS_MS` (3 h): «Ana aprobó 12 publicaciones y pidió cambios en 2 de Noviembre 2026». Las cuentas salen de
  `approvals` desde que se abrió el aviso (10 s de margen: la respuesta se guarda unos ms antes que el aviso; uno nuevo
  cuenta desde el momento exacto de la respuesta, `fecha`). Los CAMBIOS pedidos van siempre en su aviso propio, con lo que
  pidió. Actualizar un aviso no vuelve a notificar (mismo id): la notificación sale al crearlo. Un aviso leído (o pasada la
  ventana) abre otro.
- **«Enviar mi revisión» deja aviso en la campana** (`avisarRevisionCliente`): antes sólo se difundía y, sin nadie
  conectado, se perdía. Con cuántas aprobó, en cuántas pidió cambios y cuántas dejó sin revisar.
- **Sacar a alguien del equipo no deja trabajo huérfano** (`reasignarTrabajoDe`, desde DELETE /api/equipo/miembro/:id):
  `responsableId` / `revisorId` de sus publicaciones (cada mes con su `updated_at` como condición) y `asignado_id` de sus
  tareas pasan a quien lo saca, con un aviso. Y `destinatariosDe` hace que lo que responde el cliente o lo que falla en la
  cola le llegue a todo el equipo si el responsable (o quien la programó) ya no está.
- **Cuándo abrió el cliente su enlace** (`calendars.cliente_abrio_at`, 0081): lo apunta `calendarioPorTestigo` como mucho una
  vez por hora y SIN tocar `updated_at` (es la condición con la que otros escriben el mes). No cuenta quien lo abre con la
  sesión del equipo (cookie `__Host-sesion`): la agencia revisa su propio enlace. No está en `calendarToRow`: guardar el mes
  no lo pisa.
- **¿Este cliente aprueba antes de publicar?** (`clients.aprueba_antes`, 1 por defecto; `apruebaAntes` en filas.js). Con «no»:
  la barra del mes destaca «Ver y programar lo listo», «Programar lo aprobado» toma lo que tiene su pieza y no tiene
  cambios pedidos (`aprobadasSinProgramar(…, { sinAprobar })`, `listaSinAprobar`), igual `programar_lo_aprobado` de Claude.
  Producción → «Aprobadas, por programar» sigue siendo de lo aprobado. Se cambia en «Enviar a cliente». Va en `clientToRow`
  como `programar_al_aprobar` (una ficha abierta desde antes puede devolverlo a «sí» al guardarse: el mismo riesgo que ya
  tenía «Programar al aprobar»).
- **El panel de una publicación ya no arrastra el estudio de mercado ni el motor de ideas** (−36 kB comprimidos al abrirlo,
  de 113,7 a 77,6): `lib/pauta.js` leía `LIMITES_ANUNCIO` de estudioMercado.js (ahora `limitesAnuncio.js`), «Tipo de
  contenido» lo cargaba entero (ahora `import()` y SÓLO al abrir su plegable: un `<details>` monta sus hijos aunque esté
  cerrado, así que se escucha su `toggle`), y `lib/estudio.js` leía `composicionDe` de loteAnuncios.js (ahora en
  pilares.js). Las COMPOSICIONES fueron a pilares.js y no a un módulo propio a propósito: un trozo nuevo suma su nombre a la
  lista de precarga de cada chunk que lo alcanza, y el del Estudio está a pocos bytes de su tope.
- **«Enviar a cliente» se carga en diferido** (calendario/EnviarCliente.jsx; salió de dialogos.jsx), y CalendarView importa
  `programarAprobadas.js` con `import()`: con eso la carga inicial bajó 2,8 kB (lo nuevo de este encargo cabe dentro).
- **TikTok, siempre marcado (24-nov-2026).** Dos semanas de reels y fotos de D'CASA salieron sin TikTok con la cuenta
  conectada. Dos causas: (1) `redAdmite` dejaba TikTok fuera de las FOTOS por regla («se marcan a mano»), y nadie lo
  marcaba; (2) los reels SÍ lo admitían, pero los chats de Claude creaban o editaban la publicación con
  `redes: ["instagram","facebook"]` por costumbre, y una lista explícita manda sobre las de por defecto (los reels con
  `null` o creados en la app sí llevaban TikTok). La agencia lo quiere así: «que siempre estén encendidas las redes que
  tenga el cliente; si no la quiero en una, la quito yo». Ahora: las fotos y los carruseles también van a TikTok por
  defecto (YouTube sigue sólo con video; historias y directos, ni a TikTok ni a YouTube); en el MCP, `redes` dice «NO lo
  pases salvo que la PERSONA pidió quitar una red», y `crear_publicacion`/`editar_publicacion` contestan «OJO: NO sale en
  TikTok, que el cliente tiene conectado» si la lista deja fuera una conectada. Como TikTok entra con fotos, sus errores
  propios (proporciones distintas en un carrusel, más de 32 fotos, una foto fuera de 1:2.13–2.13:1) traen «Quitar
  TikTok» en el panel y, al programar SOLO (`soloPosibles`: al aprobar, «Programar lo aprobado»), `planificar()` deja
  fuera la red que no puede con la pieza y programa las demás: TikTok no puede frenar Instagram y Facebook. Pedido a
  mano, sigue fallando entero con su motivo. Lo ya guardado con una lista sin TikTok NO cambia solo (no se sabe si se
  quitó a propósito): se marca en el panel y se vuelve a programar (sólo sale lo que falta). **TikTok con fotos por
  PostPeer no se ha probado contra el servicio real.**
- **La página del cliente (/aprobar) dejaba ~300 px para la imagen en el teléfono (26-nov-2026).** La barra de vistas,
  filtros y «Revisión rápida» iba pegada arriba (`position: sticky`, ~110 px) y la de abajo («15 de 29 revisadas», los dos
  botones y la frase de ayuda) ocupaba tres líneas (~112 px); en un iPhone con el navegador, la publicación quedaba
  encajonada y los reels, además, recortados (`object-fit: cover` con `max-height`). Ahora, como en Instagram: la barra de
  arriba no se pega (se va al bajar; también en la computadora, donde tapaba el principio de la imagen), la de abajo es
  una fila («0/5» en el teléfono: la palabra queda para el lector de pantalla) y la frase de ayuda va al final de la
  página; en el teléfono las publicaciones van de borde a borde, y los reels y las historias se ven enteros
  (`object-fit: contain`) en el alto que hay. A lo ancho, toda imagen cabe en el alto de la pantalla. La revisión rápida,
  igual. Lo comprueba tests/vivo/navegador.test.js a 390×664 (un iPhone con la barra del navegador). Esta página tiene su
  propia entrada (`vite.publico.config.js`): lo de la aplicación de la agencia no le llega.
- **YouTube por PostPeer (26-nov-2026, decisión de Juan).** Juan conectó el canal de YouTube DENTRO de PostPeer, y desde
  entonces YouTube sale por ahí: la app propia de Google, sin auditar, deja PRIVADO todo lo que sube. Funciona como TikTok:
  la cuenta es `cuentas_sociales` red «youtube» con `datos.via` = «postpeer» y sin token (se vincula en Ajustes →
  Integraciones → YouTube → «Por PostPeer»; si PostPeer tiene varios canales, se pega el id). `esDePostPeer` ya no es
  sólo de TikTok. A su hora la cola manda `publishNow` con la DESCRIPCIÓN en `content` y en `platformSpecificData` el
  título, las etiquetas, `visibility`, `categoryId` y `madeForKids: false`; la miniatura va en `mediaItems[].thumbnail`
  (JPG/PNG ≤ 2 MB); un vertical o cuadrado de hasta 3 minutos lo cuenta YouTube como Short; `idempotencyKey` = la fila de
  la cola. Manda lo de `post.youtube` (preparar_youtube) y, si no, lo del texto. La fecha la pone la cola (como TikTok, no
  se usa `scheduledFor`): `post.youtube.publicarEl` no se usa por aquí. Los campos salen de su documentación
  (www.postpeer.dev/docs/platforms/youtube, /docs/posts/create-post, leída el 26-nov-2026); NADA probado contra PostPeer de
  verdad. Sus cifras no se leen desde la aplicación (no hay token de Google). Nada sale sin aprobar: la publicación
  espera en el calendario como cualquier otra.
- **La «Configuración de YouTube» de la publicación (26-nov-2026, aprobada por Juan).** Hasta hoy el título de YouTube
  era la primera línea del texto y la descripción el texto entero; nada lo decía en la pantalla. Ahora, al marcar YouTube
  en «¿Qué sale y dónde?», aparece su plegable (configYouTube.jsx, lazy) y escribe `post.youtube`. LO VACÍO VALE LO DE
  SIEMPRE: sin título, la primera línea; sin descripción propia, el mismo texto; sin etiquetas, los hashtags (las propias
  REEMPLAZAN a los hashtags, no se suman); sin categoría, la automática; sin privacidad, la del canal; sin miniatura, la
  portada. Los campos se guardan TAL CUAL se escriben (limpiarlos al teclear se comía el espacio de «Hola mundo»): los
  limpian el publicador y `limpiarYouTube` (MCP). Un HUECO sin llenar («[PEGAR ENLACE…]», «[COMPLETAR]», `huecosSinLlenar`)
  en el título, la descripción o el primer comentario NO deja programar (la descripción de BENDECIDOS llegó con uno).
  `preparar_youtube` ya no pisa la configuración: FUSIONA (lo que no prepara se queda) y acepta `descripcion` propia o
  `conservar_descripcion`. La lista de reproducción, el primer comentario y «contenido sintético» van SÓLO por PostPeer
  (`playlistId`, `firstComment`, `containsSyntheticMedia`): con la conexión de Google el permiso es el de subir y la
  pantalla lo dice. Las COLABORACIONES no existen por API (ni de Google ni de PostPeer): se menciona con @; el idioma, la
  ubicación, la licencia y «notificar a los suscriptores» tampoco los manda PostPeer. Nada de esto probado contra PostPeer
  de verdad (las listas, sobre todo: los nombres de su respuesta salen de su documentación y se leen con tolerancia).
